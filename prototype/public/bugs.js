/**
 * BUGS (#/bugs): every bug spine.ai has found, one row each, kept across runs.
 *
 * This page replaces the separate bug sheet (/api/bug-report, which now sends
 * people here): the triage happens in the table. A later run that hits the
 * same bug updates its row — the seen count, and "Still broken" or "Passing
 * now" — because the server already groups findings by the defect's
 * fingerprint; nothing here adds a second row for a repeat.
 *
 * Where everything comes from:
 *   - /api/findings: the bugs, de-duplicated by fingerprint, with severity,
 *     kind, how often and in which runs they were seen, and their evidence.
 *   - /api/bug-triage: what people decided (status, priority, blocker, dev
 *     type, dev ETA, dev comment). GET reads all of it; POST saves one cell.
 *   - /api/runs: what each recent run covered, which is how a row says
 *     "Passing now" (a later run covered the same feature and did not hit it)
 *     and which bugs "From last run" means.
 *
 * Worked out here rather than stored (see the gaps in the hand-off):
 *   - a stable ID for the platform's own finds (SP-XXXXX, from the
 *     fingerprint), since the old sheet numbered rows by position;
 *   - the Dev type spine.ai suggests, with its one-line reason;
 *   - Still broken / Passing now.
 *
 * The filters live in the address (#/bugs?scope=all&sev=critical&kind=harness
 * &q=bid, plus run= for one run's bugs), and #/bugs/{ID} opens one bug.
 * Exports are in public/bugsExport.js.
 */
(function () {
  "use strict";

  const q$ = (sel, root = document) => root.querySelector(sel);
  const h = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const read = (fn, fallback) => {
    try { const v = fn(); return v === undefined ? fallback : v; } catch { return fallback; }
  };
  const num = (n) => Number(n || 0).toLocaleString("en-US");
  const icon = (name, cls = "") => `<svg class="ico${cls ? ` ${cls}` : ""}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const onPage = () => document.documentElement.dataset.view === "bugs";
  const R = () => window.spineRuns ?? null;
  const X = () => window.spineBugExport ?? null;

  // ── the vocabularies, as the team's QA sheet spells them ─────────────────
  // `v` is what is saved (the server's spelling); `label` is what is shown.
  const STATUSES = [
    { v: "OPEN", c: "red" },
    { v: "Re-open", c: "red" },
    { v: "TO BE TESTED", c: "blue" },
    { v: "TO BE DEPLOYED", c: "blue" },
    { v: "TO BE PICKED", c: "amber" },
    { v: "TO DO", c: "amber" },
    { v: "FIXED", c: "green" },
    { v: "TO BE DISCUSSED" },
    { v: "NOT A BUG" },
    { v: "FIX LATER" },
    { v: "Duplicate Issue" },
    { v: "Feature Bug/ Enhancement", label: "Feature Bug / Enhancement" },
  ];
  const PRIORITIES = [{ v: "P0", c: "red" }, { v: "P1", c: "amber" }, { v: "P2" }, { v: "P3" }];
  const BLOCKERS = [{ v: "YES", label: "Yes", c: "red" }, { v: "NO", label: "No" }];
  const DEV_TYPES = ["BE", "FE", "BOTH", "CONFIG", "DATA", "HARNESS", "ENV", "TEST"].map((v) => ({ v }));
  const FIELDS = {
    status: { label: "Status", opts: STATUSES },
    priority: { label: "Priority", opts: PRIORITIES, mono: true },
    blocker: { label: "Blocker", opts: BLOCKERS },
    devType: { label: "Dev type", opts: DEV_TYPES, mono: true },
  };
  /** Off the Open list. Home's sidebar count uses the same three (home.js). */
  const CLOSED = new Set(["FIXED", "NOT A BUG", "Duplicate Issue"]);
  const SEVS = [["critical", "Critical"], ["high", "High"], ["medium", "Medium"], ["low", "Low"]];
  const SEV_KEYS = new Set(SEVS.map(([k]) => k));
  const PRIORITY_OF = { critical: "P0", high: "P1", medium: "P2", low: "P3" };
  const KINDS = [
    { k: "", label: "All" },
    { k: "product", label: "Product defect", kind: "product_defect" },
    { k: "silent", label: "Silent failure", kind: "contradiction" },
    { k: "test-gap", label: "Test gap", kind: "product_rejected_input" },
    { k: "harness", label: "Harness", kind: "automation_defect" },
    { k: "environment", label: "Environment", kind: "environment" },
  ];
  const KIND_KEYS = new Set(KINDS.map((x) => x.k));
  const KIND_LABEL = Object.fromEntries(KINDS.filter((x) => x.kind).map((x) => [x.kind, x.label]));
  const SCOPES = [["open", "Open"], ["last", "From last run"], ["all", "All bugs"]];
  const SCOPE_KEYS = new Set(SCOPES.map(([k]) => k));

  const st = {
    groups: null,      // /api/findings groups, as last answered
    triage: {},        // fingerprint → saved cells
    runs: [],          // /api/runs
    err: false,
    scope: "open",
    sev: "",
    kind: "",
    q: "",
    run: "",           // one run's bugs (#/bugs?run=…)
    picked: new Set(), // fingerprints ticked
    kept: new Set(),   // edited rows that stay in view until the filters change
    openId: "",        // the bug in the drawer
    stale: false,
    wasOpen: false,
    lastFocus: null,
  };

  // ── loading ──────────────────────────────────────────────────────────────
  let loadSeq = 0;
  function params() {
    // The same parameters the rest of the page sends; /api/findings does not
    // filter on them yet (see the gaps).
    const qs = new URLSearchParams();
    const c = read(() => currentClient, null);
    if (c != null) qs.set("c", String(c));
    const base = read(() => customBase, "");
    if (base) qs.set("base", base);
    return qs.toString();
  }
  const getJson = async (url) => {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
  };
  async function load() {
    const seq = ++loadSeq;
    // Until the client is known there is no list to show: an answer without it
    // came back empty and read as "0 of 0 bugs" for a run that had six (15 Oct).
    // Keep the loading rows, and ask again in a moment.
    if (read(() => currentClient, null) == null) {
      st.groups = null;
      render();
      setTimeout(() => { if (seq === loadSeq) load(); }, 600);
      return;
    }
    const qs = params();
    try {
      const [findings, triage, runs] = await Promise.all([
        getJson(`/api/findings?${qs}`),
        getJson(`/api/bug-triage?${qs}`),
        getJson(`/api/runs?${qs}`).catch(() => ({ runs: [] })),
      ]);
      if (seq !== loadSeq) return;
      st.groups = Array.isArray(findings.groups) ? findings.groups : [];
      st.triage = triage?.triage ?? {};
      st.runs = Array.isArray(runs?.runs) ? runs.runs : [];
      st.err = false;
      ids.clear();
    } catch {
      if (seq !== loadSeq) return;
      st.err = true;
    }
    st.stale = false;
    st.kept.clear();
    render();
    syncDrawer();
  }

  // ── one bug, as the page shows it ────────────────────────────────────────
  /** A short ID that stays the bug's own however the list is ordered. */
  const ids = new Map();
  function stableId(fp) {
    if (ids.has(fp)) return ids.get(fp);
    let x = 0x811c9dc5;
    for (let i = 0; i < fp.length; i++) {
      x ^= fp.charCodeAt(i);
      x = Math.imul(x, 0x01000193) >>> 0;
    }
    let id = `SP-${x.toString(36).toUpperCase().padStart(5, "0").slice(-5)}`;
    const taken = new Set(ids.values());
    for (let n = 2; taken.has(id); n++) id = `${id.replace(/-\d+$/, "")}-${n}`;
    ids.set(fp, id);
    return id;
  }

  const userName = () => {
    const u = read(() => window.spineAuth.user(), null);
    return u ? String(u.name || String(u.email || "").split("@")[0] || "") : "";
  };

  /** "plan.Create_RFQ-only_with_2_line_items: app reported …" → "app reported …" */
  const cleanTitle = (t) => {
    const s = String(t ?? "").replace(/^[a-z][a-z-]*(?:\.[A-Za-z0-9_+,()'-]+)+:\s*/, "").trim();
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : "Untitled bug";
  };

  function moduleOf(flows) {
    const groups = read(() => featureGroups, []) || [];
    const out = new Set();
    for (const f of flows ?? []) {
      const head = String(f).split(".")[0];
      const g = groups.find((x) => x.id === head);
      if (g) out.add(g.label);
      else if (head === "plan") out.add("Test plan");
      else if (head === "api-plan") out.add("API plan");
      else out.add(head.length <= 4 ? head.toUpperCase() : head.charAt(0).toUpperCase() + head.slice(1).replace(/[_-]+/g, " "));
    }
    return [...out].join(", ") || "Platform";
  }

  /** Which features a run covered, from what it was asked to do. */
  function coverage(r) {
    const q = String(r?.request ?? "");
    const f = q.match(/^\s*features:\s*(.+)$/i);
    if (f) return f[1].split(",").map((s) => s.trim()).filter(Boolean);
    const j = q.match(/^\s*browser journey:\s*(\S+)/i);
    return j ? [j[1]] : [];
  }
  const runTitle = (r) => read(() => R().titleOf(r), "") || String(r?.request ?? r?.id ?? "a run");
  const dateOf = (t) => {
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  };

  /**
   * Still broken, or passing now.
   *
   * Passing now: a run newer than the last time this bug was seen covered one
   * of the features it was found on, and did not hit it. Otherwise the latest
   * evidence is the bug itself, so it is still broken as far as anyone knows.
   */
  function stateOf(g) {
    if (g.curated) return { k: "hand", word: "PO suite finding", why: "Written up in the PO API suite's findings list (config/findings.yaml), not found by a spine.ai run" };
    const last = Date.parse(g.lastSeen);
    if (!Number.isFinite(last)) return { k: "broken", word: "Still broken", why: "No run has passed it since" };
    const flows = new Set(g.flows ?? []);
    const hit = new Set(g.runs ?? []);
    const later = st.runs
      .filter((r) => !hit.has(r.id) && Date.parse(r.ts) > last && coverage(r).some((f) => flows.has(f)))
      .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))[0];
    return later
      ? { k: "passing", word: "Passing now", why: `${runTitle(later)} covered it on ${dateOf(later.ts)} and did not hit it` }
      : { k: "broken", word: "Still broken", why: `Last seen ${dateOf(g.lastSeen)}; no later run has passed it` };
  }

  /**
   * The Dev type spine.ai suggests, and why — from the failing evidence.
   * An API 4xx/5xx or a wrong answer is BE; a wrong screen over a working
   * API is FE; both is BOTH; a client setting is CONFIG; the automation
   * breaking is HARNESS; the environment or sign-in is ENV.
   */
  function suggestDevType(g) {
    const text = `${g.title} ${g.rationale ?? ""} ${(g.evidence ?? []).join(" ")}`;
    const http = [...text.matchAll(/(?:HTTP|returns HTTP|→ HTTP|-> )\s*([1-5]\d\d)\b/g)].map((m) => Number(m[1]));
    const bad = http.find((s) => s >= 400);
    const onScreen = /App error:|Ended on https?:|on screen|the cell reads|attempts|keeps the user waiting|Got stuck/i.test(text);
    if (g.kind === "environment") return ["ENV", "the environment, not the product"];
    if (/sign(?:ed)? in|log ?in|one-time code|saved session/i.test(g.title)) return ["ENV", "sign-in, not the product"];
    if (g.kind === "automation_defect") {
      if (/stuck|locator/i.test(text)) return ["HARNESS", "the automation got stuck on a step"];
      if (/without evidence/i.test(text)) return ["HARNESS", "it failed with no error from the app"];
      return ["HARNESS", "the automation broke"];
    }
    if (g.kind === "product_rejected_input") return ["TEST", "the test's input was refused"];
    if (bad && onScreen) return ["BOTH", `API returned ${bad} and the screen broke`];
    if (bad) return ["BE", `API returned ${bad}`];
    if (/accepts input it should reject/i.test(g.title)) return ["BE", "the API accepted bad input"];
    if (g.kind === "contradiction") return ["BE", "the API said OK; the data disagrees"];
    if (http.some((s) => s >= 200 && s < 300)) return ["BE", "the API answered with the wrong data"];
    if (/keeps the user waiting/i.test(g.title)) return ["FE", "slow on screen"];
    if (/only settles after|attempts/i.test(g.title)) return ["FE", "the screen did not settle"];
    if (/the cell reads|value-not-saved/i.test(text)) return ["FE", "the value did not stay on screen"];
    // Words, not endpoint names ("/trade/template_input") or "setting up".
    const words = String(g.title).replace(/\/\S+/g, " ");
    if (/template|\bsettings?\b(?!\s+up)|configur|maximum no|limit reached/i.test(words)) return ["CONFIG", "a client setting or limit"];
    if (/App error:/i.test(text)) return ["FE", "the screen showed an error"];
    return ["BE", "found by an API check"];
  }

  const statusWord = (raw) => {
    const s = String(raw ?? "").trim();
    if (!s) return "";
    const hit = STATUSES.find((o) => o.v.toLowerCase() === s.toLowerCase() || (o.label ?? "").toLowerCase() === s.toLowerCase());
    return hit ? hit.v : s;
  };

  /** Everything a row, the drawer and an export need, from the bug and its triage. */
  function model(g) {
    const t = st.triage[g.defectFingerprint] ?? {};
    const cur = g.curated ?? null;
    const sev = SEV_KEYS.has(g.severity) ? g.severity : "medium";
    const id = cur?.issueId || g.knownBug?.id || stableId(g.defectFingerprint);
    const [autoType, autoWhy] = suggestDevType(g);
    let devType = autoType;
    let devBy = `by spine.ai · ${autoWhy}`;
    if (t.devType) {
      devType = t.devType;
      devBy = `set by ${t.devTypeBy || "a person"}`;
    } else if (cur?.devType) {
      devType = cur.devType;
      devBy = "set in the PO suite's findings";
    }
    const runs = (g.runs ?? []).length;
    const seen = cur ? `from the PO suite's findings · ${curatedClientName(cur.client)}` : `seen ${num(g.occurrences)}× in ${num(runs)} run${runs === 1 ? "" : "s"}`;
    // The plain write-up's title (src/report/plainBugs.ts); the recorded line
    // ("PATCH /event_groups/… returns HTTP 500") stays searchable and is under "For developers".
    const title = (!cur && g.plain?.title) || cleanTitle(cur?.title || g.title);
    const module = t.module || cur?.module || moduleOf(g.flows);
    const userType = t.userType || cur?.userType || "All users";
    const status =
      statusWord(t.status) || statusWord(cur?.devStatus) || statusWord(g.knownBug?.status) ||
      (g.kind === "product_rejected_input" || g.kind === "environment" ? "TO BE DISCUSSED" : "OPEN");
    return {
      key: g.defectFingerprint,
      g,
      id,
      sev,
      kind: g.kind,
      title,
      module,
      userType,
      seen,
      state: stateOf(g),
      status,
      priority: t.priority || cur?.priority || g.knownBug?.priority || PRIORITY_OF[sev],
      blocker: t.blocker || (cur ? (cur.blocker ? "YES" : "NO") : sev === "critical" ? "YES" : "NO"),
      devType,
      devBy,
      devEta: t.devEta || "",
      devComment: t.devComment || "",
      search: `${id} ${title} ${module} ${userType} ${g.title} ${g.plain?.summary ?? ""} ${g.rationale ?? ""} ${(g.flows ?? []).join(" ")} ${(g.evidence ?? []).slice(0, 6).join(" ")}`.toLowerCase(),
    };
  }

  // ── the bug's story: what the drawer and the PDF tell ────────────────────
  const stripTag = (s) => String(s).replace(/^\[[a-z-]+\]\s*/i, "").trim();
  /** A link the page makes ("#/session/…", "/api/…") as one that works from a sheet or a PDF too. */
  const absolute = (href) => (/^https?:/.test(href) ? href : `${location.origin}${location.pathname.replace(/\/$/, "")}${href.startsWith("#") ? "/" : ""}${href}`.replace(/([^:])\/\/+/g, "$1/"));

  function storyOf(m) {
    const g = m.g;
    const hu = g.human ?? {};
    const pl = g.plain ?? null;
    const rep = (g.reproduction ?? []).map(String);
    const curlStart = rep.findIndex((r) => /^curl\b/.test(r));
    const curl = pl?.artifacts?.find((a) => a.kind === "request")?.text ||
      (curlStart >= 0 ? rep.slice(curlStart).filter((r, i, all) => i === 0 || /^\s/.test(r) || /\\$/.test(all[i - 1])).join("\n") : "");
    const steps = (pl?.steps?.length ? pl.steps : hu.steps?.length ? hu.steps : rep.filter((r, i) =>
      !(curlStart >= 0 && i >= curlStart) &&
      !/^(Expected|Actual|Full evidence|Documented|Oracle)\b/.test(r) &&
      !/[{}]/.test(r) && !/^\s/.test(r)))
      .map(stripTag)
      .map((r) => r.replace(/:\s*\/api\/\S+$/, ""))
      .filter(Boolean)
      .slice(0, 10);
    const line = (re) => rep.find((r) => re.test(r))?.replace(re, "").trim() || "";
    const runs = g.runs ?? [];
    const artifacts = (pl?.artifacts ?? []).filter((a) => a.kind !== "request");
    return {
      what: pl?.summary || hu.what || g.rationale || "",
      where: pl?.where || hu.where || [...new Set((g.flows ?? []).map((f) => read(() => featureLabel(f), f)))].join("; "),
      steps,
      expected: pl?.expected || hu.expected || line(/^Expected[:\s]+/i),
      actual: pl?.actual || hu.actual || line(/^Actual[:\s]+/i) || hu.what || g.rationale || "",
      ways: pl?.ways ?? [],
      shots: artifacts.filter((a) => a.kind === "screenshot" && a.href).map((a) => ({ label: a.label, href: a.href, url: absolute(a.href) })),
      // How it happened: a failed browser run's video, and its step-by-step Playwright replay (29 Oct).
      videos: artifacts.filter((a) => a.kind === "video" && a.href).map((a) => ({ label: a.label, href: a.href, url: absolute(a.href) })),
      replays: artifacts.filter((a) => a.kind === "replay" && a.href).map((a) => ({ label: a.label, href: a.href, url: absolute(a.href) })),
      links: artifacts.filter((a) => (a.kind === "session" || a.kind === "report") && a.href).map((a) => ({ label: a.label, href: a.href, url: absolute(a.href) })),
      reply: artifacts.find((a) => a.kind === "reply")?.text ?? "",
      curl,
      evidence: (g.evidence ?? []).slice(0, 6),
      techTitle: g.title,
      endpoint: pl?.forDevs?.endpoint ?? "",
      devNotes: pl?.forDevs?.notes ?? [],
      writtenBy: pl?.writtenBy ?? "",
      runs,
      often: g.curated
        ? `Written up in the PO API suite's findings list for ${curatedClientName(g.curated.client)}, not found by a spine.ai run.`
        : `Seen ${num(g.occurrences)} time${g.occurrences === 1 ? "" : "s"} in ${num(runs.length)} run${runs.length === 1 ? "" : "s"}` +
          `${g.firstSeen ? `, first on ${dateOf(g.firstSeen)}` : ""}${g.lastSeen && g.lastSeen !== g.firstSeen ? `, last on ${dateOf(g.lastSeen)}` : ""}.`,
    };
  }

  /** One flat row for the exports: the sheet's columns plus the story. */
  function exportRow(m) {
    return {
      id: m.id, status: labelOf("status", m.status), devEta: m.devEta, priority: m.priority,
      blocker: labelOf("blocker", m.blocker), devType: m.devType, devComment: m.devComment,
      userType: m.userType, module: m.module, title: m.title, severity: m.sev,
      kind: KIND_LABEL[m.kind] ?? "Product defect", state: m.state.word, seen: m.seen,
      ...storyOf(m),
    };
  }

  // ── which bugs this view shows ───────────────────────────────────────────
  /**
   * The PO suite's written-up findings (D__…) belong to the PO accounts they
   * were found on, not to every client: each names its account — Procol
   * Sandbox Demo, Decathlon, or both. Only the platform's own finds are not
   * yet split by client (/api/findings carries no client). The two ids are
   * the PO accounts in config/tokenClients.ts.
   */
  const SUITE_ACCOUNT = { 900001: "procol_sandbox_demo", 900002: "decathlon" };
  const SUITE_NAME = { procol_sandbox_demo: "Procol Sandbox Demo", decathlon: "Decathlon", both: "Procol Sandbox Demo and Decathlon" };
  const curatedClientName = (c) => SUITE_NAME[c] ?? (c ? String(c).replace(/_/g, " ") : "the PO accounts");
  function curatedForClient(curatedClient) {
    const here = SUITE_ACCOUNT[Number(read(() => currentClient, 0))];
    if (!here) return false;
    return curatedClient === "both" || curatedClient === here;
  }
  const models = () => (st.groups ?? []).filter((g) => !g.curated || curatedForClient(g.curated.client)).map(model);
  const latestRun = () => [...st.runs].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))[0] ?? null;
  const runById = (id) => st.runs.find((r) => r.id === id) ?? null;

  function inScope(m) {
    if (st.run) return (m.g.runs ?? []).includes(st.run);
    if (st.scope === "open") return !CLOSED.has(m.status);
    if (st.scope === "last") {
      const r = latestRun();
      return !!r && (m.g.runs ?? []).includes(r.id);
    }
    return true;
  }
  function visible(all) {
    const q = st.q.trim().toLowerCase();
    const kind = KINDS.find((x) => x.k === st.kind)?.kind;
    return all.filter((m) =>
      (st.kept.has(m.key) || inScope(m)) &&
      (!st.sev || m.sev === st.sev) &&
      (!kind || m.kind === kind) &&
      (!q || m.search.includes(q)));
  }

  // ── drawing ──────────────────────────────────────────────────────────────
  const optOf = (field, v) => FIELDS[field].opts.find((o) => o.v === v) ?? null;
  const labelOf = (field, v) => optOf(field, v)?.label ?? v;

  /** "TO BE TESTED" → "To be tested": the sheet's words, read as words. */
  const sentence = (t) => { const x = String(t ?? "").toLowerCase(); return x.charAt(0).toUpperCase() + x.slice(1); };
  function pillHtml(m, field, { quiet = false } = {}) {
    const f = FIELDS[field];
    const v = m[field];
    const o = optOf(field, v);
    // In the list an open bug's status is grey: the red is kept for what needs a look (Re-open, P0, Blocker).
    const c = quiet && field === "status" && v === "OPEN" ? "" : o?.c ?? "";
    return (
      `<button type="button" class="bg-pill${c ? ` t-${c}` : ""}${f.mono ? " mono" : ""}" data-field="${field}" ` +
      `aria-haspopup="listbox" aria-expanded="false" aria-label="${h(`${f.label} for ${m.id}: ${labelOf(field, v)}`)}" title="${h(labelOf(field, v))}">` +
      (c ? `<span class="bg-dot c-${c}" aria-hidden="true"></span>` : "") +
      `<span class="bg-pv">${h(field === "status" ? sentence(labelOf(field, v)) : labelOf(field, v))}</span>${icon("chevron-down", "chev")}</button>`
    );
  }

  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  function etaHtml(m) {
    const v = m.devEta;
    // An old sheet value such as "12/10" is kept as written rather than lost.
    const type = !v || ISO.test(v) ? "date" : "text";
    return (
      `<label class="bg-eta${v ? " has-value" : ""}">${icon("calendar")}` +
      `<span class="sr-only">Dev ETA for ${h(m.id)}</span>` +
      `<input type="${type}" data-field="devEta" value="${h(v)}"${type === "text" ? ' placeholder="dd/mm"' : ""} /></label>`
    );
  }

  /**
   * The Artifacts cell (Aanya, 29 Oct: "a column for artifacts for the images or the video links of
   * where and how the bug occurred"): the screen where it went wrong (a thumbnail, with how many
   * pictures there are), the run's video, its step-by-step replay, and the run's report. Each opens in
   * a new tab; the drawer has them all.
   */
  function artHtml(m) {
    const s = storyOf(m);
    const out = [];
    // Icons, not words (Aanya, 29 Oct: "so much content"): the picture count, the video, the report. Each opens in a new tab.
    const chip = (href, ico, n, title) =>
      `<a class="bg-artchip" href="${h(href)}" target="_blank" rel="noopener" title="${h(title)}" aria-label="${h(title)}">${icon(ico)}${n ? `<span>${n}</span>` : ""}</a>`;
    if (s.videos[0]) out.push(chip(s.videos[0].href, "video", "", s.videos[0].label));
    if (s.shots[0]) out.push(chip(s.shots[0].href, "app-window", s.shots.length > 1 ? s.shots.length : "", `${s.shots.length} screenshot${s.shots.length === 1 ? "" : "s"} — ${s.shots[0].label}`));
    const report = s.links.find((x) => !x.href.startsWith("#"));
    if (report) out.push(chip(report.href, "file-text", "", report.label));
    return out.length ? `<div class="bg-arts">${out.join("")}</div>` : "";
  }

  /** What the developers said, only when they said it: the type, the ETA, a comment (its words on hover). */
  function devHtml(m) {
    const out = [];
    if (m.devType) out.push(`<span class="bg-devtype" title="${h(m.devBy)}">${h(m.devType)}</span>`);
    if (m.devEta) out.push(`<span class="bg-deveta" title="Dev ETA">${icon("calendar")}${h(ISO.test(m.devEta) ? new Date(m.devEta).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : m.devEta)}</span>`);
    if (m.devComment) out.push(`<span class="bg-devnote" title="${h(m.devComment)}">${icon("pen-line")}${h(m.devComment.slice(0, 28))}${m.devComment.length > 28 ? "…" : ""}</span>`);
    return out.join("");
  }

  function rowHtml(m) {
    const picked = st.picked.has(m.key);
    const href = detailHref(m.id);
    return (
      `<tr data-key="${h(m.key)}"${picked ? ' class="is-picked"' : ""}>` +
      `<td class="c-check"><input type="checkbox" data-act="pick"${picked ? " checked" : ""} aria-label="Select ${h(m.id)}" /></td>` +
      // The bug in two lines — its words, then where it is from — and only what tells this row from the next
      // (Aanya, 29 Oct: "the bug page feels like so much content"). Blocker, Dev type, ETA and comment are
      // edited in the bug's panel; the row shows them only when they say something.
      `<td class="c-bug"><a class="bg-desc" href="${h(href)}" data-act="detail">${h(m.title)}</a>` +
      `<p class="bg-meta"><span class="bg-id">${h(m.id)}</span> · ${h(m.module)} · ${h(m.seen)} · <span class="bg-state st-${m.state.k}" title="${h(m.state.why)}">${h(m.state.word)}</span></p></td>` +
      `<td class="c-edit" data-l="Status">${pillHtml(m, "status", { quiet: true })}</td>` +
      `<td class="c-edit" data-l="Priority"><div class="bg-pri">${pillHtml(m, "priority")}${m.blocker === "YES" ? `<span class="bg-blocker" title="A blocker">Blocker</span>` : ""}</div></td>` +
      `<td class="c-art" data-l="Evidence">${artHtml(m)}</td>` +
      `<td class="c-dev" data-l="Developer">${devHtml(m)}</td>` +
      `<td class="c-open"><a class="bg-open" href="${h(href)}" data-act="detail" aria-label="Open ${h(m.id)}">${icon("chevron-right")}</a></td>` +
      `</tr>`
    );
  }

  const HEAD =
    `<thead><tr><th class="c-check" scope="col"><input type="checkbox" data-act="pick-all" aria-label="Select all bugs shown" /></th>` +
    `<th class="c-bug" scope="col">Bug</th><th scope="col">Status</th><th scope="col">Priority</th>` +
    `<th scope="col">Evidence</th><th scope="col">Developer</th>` +
    `<th class="c-open" scope="col"><span class="sr-only">Open</span></th></tr></thead>`;

  const SKELETON =
    `<div class="bg-card" aria-hidden="true"><table class="bg-table">${HEAD}<tbody>` +
    Array.from({ length: 6 }, () =>
      `<tr class="bg-skel"><td class="c-check"></td><td class="c-bug"><span class="bg-sk w-id"></span><span class="bg-sk w-t"></span><span class="bg-sk w-m"></span></td>` +
      `<td><span class="bg-sk w-p" style="width:64px"></span></td><td><span class="bg-sk w-p" style="width:44px"></span></td>` +
      `<td><span class="bg-sk w-p" style="width:56px"></span></td><td><span class="bg-sk w-p" style="width:44px"></span></td><td></td></tr>`,
    ).join("") +
    `</tbody></table></div>`;

  function paintTiles(all) {
    const box = q$("#bg-tiles");
    if (!box) return;
    const had = document.activeElement?.closest?.(".bg-tile")?.dataset.sev;
    box.innerHTML = SEVS.map(([k, label]) => {
      const of = all.filter((m) => m.sev === k);
      const open = of.filter((m) => !CLOSED.has(m.status)).length;
      return (
        `<button type="button" class="bg-tile" data-sev="${k}" aria-pressed="${st.sev === k}" ` +
        `aria-label="${h(`${label}: ${open} open of ${of.length}. ${st.sev === k ? "Filtering — press to clear" : "Show only these"}`)}">` +
        `<span class="bg-tile-name"><span class="bg-sdot s-${k}" aria-hidden="true"></span>${h(label)}</span>` +
        `<span class="bg-tile-n"><b>${num(open)}</b><span>open${open === of.length ? "" : ` of ${num(of.length)}`}</span></span></button>`
      );
    }).join("");
    if (had) box.querySelector(`[data-sev="${had}"]`)?.focus();
  }

  function paintTools() {
    for (const b of document.querySelectorAll("#bg-scope button")) {
      b.setAttribute("aria-pressed", String(!st.run && b.dataset.scope === st.scope));
    }
    const kind = q$("#bg-kind");
    if (kind) {
      const label = KINDS.find((x) => x.k === st.kind)?.label ?? "All";
      kind.querySelector("b").textContent = label;
      kind.setAttribute("aria-label", `Kind: ${label}`);
    }
    const chip = q$("#bg-runchip");
    if (chip) {
      chip.hidden = !st.run;
      if (st.run) {
        const r = runById(st.run);
        chip.querySelector("span").textContent = `From run: ${r ? runTitle(r) : st.run}`;
      }
    }
    const box = q$("#bg-q");
    if (box && document.activeElement !== box && box.value !== st.q) box.value = st.q;
  }

  function paintSelection(shown) {
    const bar = q$("#bg-selbar");
    // A ticked row that a filter hides stays ticked; the count says so.
    for (const key of [...st.picked]) if (!(st.groups ?? []).some((g) => g.defectFingerprint === key)) st.picked.delete(key);
    const n = st.picked.size;
    if (bar) {
      bar.hidden = n === 0;
      q$("#bg-seln").textContent = `${num(n)} bug${n === 1 ? "" : "s"} selected`;
    }
    const all = q$('#bg-body [data-act="pick-all"]');
    if (all) {
      const on = shown.filter((m) => st.picked.has(m.key)).length;
      all.checked = shown.length > 0 && on === shown.length;
      all.indeterminate = on > 0 && on < shown.length;
    }
  }

  let announceTimer = null;
  function announce(text) {
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => {
      const said = q$("#bg-said");
      if (said && said.textContent !== text) said.textContent = text;
    }, 400);
  }

  const companyName = () => read(() => currentClientName, "") || "this client";

  function emptyHtml(all) {
    if (!all.length) {
      return `<div class="bg-card bg-empty"><p class="bg-empty-t">No bugs yet</p><p class="bg-note">Run some tests: anything that breaks lands here, one row per bug.</p></div>`;
    }
    if (st.run) {
      const r = runById(st.run);
      return (
        `<div class="bg-card bg-empty"><p class="bg-empty-t">No bugs on this list came from this run</p>` +
        `<p class="bg-note">${h(r ? runTitle(r) : st.run)} · <a class="bg-link" href="/api/bug-report?run=${encodeURIComponent(st.run)}" target="_blank" rel="noopener">Open the run's own bug sheet</a></p>` +
        `<button type="button" class="bg-link" data-act="all">Show all bugs</button></div>`
      );
    }
    if (!st.sev && !st.kind && !st.q.trim()) {
      if (st.scope === "open") {
        return `<div class="bg-card bg-empty"><p class="bg-empty-t">No open bugs.</p><button type="button" class="bg-link" data-act="all">Show all bugs</button></div>`;
      }
      if (st.scope === "last") {
        const r = latestRun();
        return (
          `<div class="bg-card bg-empty"><p class="bg-empty-t">The last run hit none of these bugs</p>` +
          (r ? `<p class="bg-note">${h(runTitle(r))} · ${h(dateOf(r.ts))}</p>` : "") +
          `<button type="button" class="bg-link" data-act="all">Show all bugs</button></div>`
        );
      }
    }
    const what = st.q.trim() ? `‘${st.q.trim()}’` : "these filters";
    return `<div class="bg-card bg-empty"><p class="bg-empty-t">Nothing matches ${h(what)}</p><button type="button" class="bg-link" data-act="clear">Clear filters</button></div>`;
  }

  let current = [];
  function render() {
    const body = q$("#bg-body");
    if (!body) return;
    paintTools();
    const loading = st.groups == null && !st.err;
    const retry = `<div class="bg-card bg-alert" role="alert">Couldn't load bugs · <button type="button" class="bg-link" data-act="retry">Retry</button></div>`;
    // No client name here yet: /api/findings is not filtered by client, so
    // "for PROCOL DEMO" would sit over Decathlon's PO bugs. With a filtered
    // endpoint this becomes `Every bug spine.ai found for ${companyName()}, …`.
    if (loading) {
      paintTiles([]);
      body.innerHTML = SKELETON;
      body.setAttribute("aria-busy", "true");
      paintFoot(0, 0);
      return;
    }
    if (st.groups == null) {
      paintTiles([]);
      body.innerHTML = retry;
      body.setAttribute("aria-busy", "false");
      paintFoot(0, 0);
      return;
    }
    const all = models();
    paintTiles(all);
    const shown = visible(all);
    current = shown;
    const focus = focusKey();
    body.innerHTML =
      (st.err ? retry : "") +
      (shown.length
        ? `<div class="bg-card"><table class="bg-table">${HEAD}<tbody>${shown.map(rowHtml).join("")}</tbody></table></div>`
        : emptyHtml(all));
    body.setAttribute("aria-busy", "false");
    restoreFocus(focus);
    paintSelection(shown);
    paintFoot(shown.length, all.length);
    announce(`${num(shown.length)} of ${num(all.length)} bugs`);
  }

  function paintFoot(shown, total) {
    const n = q$("#bg-count");
    // While the list is still loading there is no count to give.
    if (n) n.textContent = st.groups == null && !st.err ? "Loading…" : `${num(shown)} of ${num(total)} bugs`;
  }

  /** Where the focus was inside the table, so a redraw puts it back. */
  function focusKey() {
    const a = document.activeElement;
    const tr = a?.closest?.("#bg-body tr[data-key]");
    if (!tr) return null;
    return { key: tr.dataset.key, field: a.dataset.field || a.dataset.act || "" };
  }
  function restoreFocus(f) {
    if (!f) return;
    const tr = q$(`#bg-body tr[data-key="${CSS.escape(f.key)}"]`);
    const el = tr?.querySelector(`[data-field="${f.field}"], [data-act="${f.field}"]`);
    el?.focus();
  }

  /** One row in place, after an edit, keeping the focus where it was. */
  function paintRow(key) {
    const tr = q$(`#bg-body tr[data-key="${CSS.escape(key)}"]`);
    const g = (st.groups ?? []).find((x) => x.defectFingerprint === key);
    if (!tr || !g) return;
    const focus = focusKey();
    const t = document.createElement("template");
    t.innerHTML = `<table><tbody>${rowHtml(model(g))}</tbody></table>`;
    tr.replaceWith(t.content.querySelector("tr"));
    restoreFocus(focus);
  }

  /** Counts after an edit, without redrawing the rows. */
  function afterEdit() {
    paintTiles(models());
    paintSelection(current);
  }
  /** Once the server has the edit: Home redraws the sidebar's red count (home.js). */
  const saved = () => window.dispatchEvent(new CustomEvent("spine:bugs-changed"));

  // ── saving ───────────────────────────────────────────────────────────────
  async function post(key, field, value) {
    const res = await fetch("/api/bug-triage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: key, field, value }),
    });
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
  }

  /**
   * One cell, optimistically: the row changes now, the server is told, and a
   * failure puts the old value back quietly with a toast that can retry.
   */
  async function save(key, field, value) {
    const before = { ...(st.triage[key] ?? {}) };
    const row = { ...before };
    if (value === "") delete row[field];
    else row[field] = value;
    const by = field === "devType" ? userName() : "";
    if (field === "devType") row.devTypeBy = by || "a person";
    st.triage[key] = row;
    st.kept.add(key);
    paintRow(key);
    paintTriage(key);
    afterEdit();
    try {
      const out = await post(key, field, value);
      if (out?.row) st.triage[key] = { ...out.row, ...(field === "devType" ? { devTypeBy: row.devTypeBy } : {}) };
      // Who set the Dev type is a second cell. A server that does not keep it
      // yet answers 400; the type itself is saved either way.
      if (field === "devType") {
        await post(key, "devTypeBy", value ? by : "").then((o) => o?.row && (st.triage[key] = o.row)).catch(() => {});
      }
      saved();
      return true;
    } catch {
      st.triage[key] = before;
      paintRow(key);
      paintTriage(key);
      afterEdit();
      toast("Couldn't save", { label: "Retry", run: () => save(key, field, value) });
      return false;
    }
  }

  async function saveMany(keys, field, value) {
    const results = await Promise.all(keys.map((k) => saveQuiet(k, field, value)));
    const failed = keys.filter((_, i) => !results[i]);
    if (failed.length < keys.length) saved();
    if (failed.length) {
      toast(`Couldn't save ${num(failed.length)} of ${num(keys.length)}`, { label: "Retry", run: () => saveMany(failed, field, value) });
    } else {
      toast(`${FIELDS[field].label} set to ${labelOf(field, value)} on ${num(keys.length)} bug${keys.length === 1 ? "" : "s"}`);
    }
  }
  /** As save(), with the toast left to the caller. */
  async function saveQuiet(key, field, value) {
    const before = { ...(st.triage[key] ?? {}) };
    st.triage[key] = { ...before, [field]: value };
    st.kept.add(key);
    paintRow(key);
    try {
      const out = await post(key, field, value);
      if (out?.row) st.triage[key] = out.row;
      return true;
    } catch {
      st.triage[key] = before;
      paintRow(key);
      return false;
    } finally {
      afterEdit();
    }
  }

  // ── a toast ──────────────────────────────────────────────────────────────
  function toast(text, action) {
    let box = q$("#bg-toasts");
    if (!box) {
      box = document.createElement("div");
      box.id = "bg-toasts";
      box.className = "bg-toasts";
      box.setAttribute("role", "status");
      box.setAttribute("aria-live", "polite");
      document.body.appendChild(box);
    }
    const t = document.createElement("div");
    t.className = "bg-toast";
    t.innerHTML = `<span>${h(text)}</span>${action ? `<button type="button">${h(action.label)}</button>` : ""}`;
    const done = () => t.remove();
    t.querySelector("button")?.addEventListener("click", () => {
      done();
      action.run();
    });
    box.appendChild(t);
    setTimeout(done, action ? 8000 : 3500);
  }

  // ── a listbox, drawn on <body> so the table never clips it ───────────────
  let pop = null;
  function closePop(refocus = true) {
    if (!pop) return;
    const { el, trigger } = pop;
    pop = null;
    el.remove();
    trigger?.setAttribute("aria-expanded", "false");
    if (refocus && trigger?.isConnected) trigger.focus();
  }

  function place(el, trigger, width) {
    const r = trigger.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    el.style.minWidth = `${Math.max(190, width ?? 0)}px`;
    const w = el.offsetWidth;
    const hgt = el.offsetHeight;
    let left = Math.min(r.left, vw - w - 8);
    left = Math.max(8, left);
    let top = r.bottom + 6;
    if (top + hgt > vh - 8 && r.top - hgt - 6 > 8) top = r.top - hgt - 6;
    el.style.left = `${left}px`;
    el.style.top = `${Math.max(8, top)}px`;
  }

  /**
   * Opens a listbox under `trigger`: arrow keys move, Enter picks, Esc or a
   * click outside closes, and the current value carries a tick.
   */
  function openList(trigger, { label, options, current: cur, mono, onPick }) {
    closePop(false);
    const el = document.createElement("div");
    el.className = "bg-pop";
    el.setAttribute("role", "listbox");
    el.setAttribute("tabindex", "-1");
    el.setAttribute("aria-label", label);
    const uid = `bg-opt-${Math.random().toString(36).slice(2, 8)}`;
    el.innerHTML = options
      .map((o, i) =>
        `<div class="bg-opt${mono ? " mono" : ""}" role="option" id="${uid}-${i}" data-i="${i}" aria-selected="${o.v === cur}">` +
        `<span class="bg-dot${o.c ? ` c-${o.c}` : ""}" aria-hidden="true"></span><span class="bg-opt-l">${h(o.label ?? o.v)}</span>${icon("check", "tick")}</div>`)
      .join("");
    document.body.appendChild(el);
    place(el, trigger, trigger.offsetWidth);
    trigger.setAttribute("aria-expanded", "true");
    let active = Math.max(0, options.findIndex((o) => o.v === cur));
    const opts = [...el.querySelectorAll(".bg-opt")];
    const move = (i) => {
      active = (i + opts.length) % opts.length;
      opts.forEach((o, k) => o.classList.toggle("is-active", k === active));
      el.setAttribute("aria-activedescendant", opts[active].id);
      opts[active].scrollIntoView({ block: "nearest" });
    };
    const pick = (i) => {
      const o = options[i];
      closePop(true);
      if (o) onPick(o.v);
    };
    move(active);
    el.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); move(active + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); move(active - 1); }
      else if (e.key === "Home") { e.preventDefault(); move(0); }
      else if (e.key === "End") { e.preventDefault(); move(opts.length - 1); }
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(active); }
      else if (e.key === "Escape") { e.preventDefault(); closePop(true); }
      else if (e.key === "Tab") { closePop(false); }
      else if (e.key.length === 1 && /\S/.test(e.key)) {
        // Type a letter to jump to the next option that starts with it.
        const k = e.key.toLowerCase();
        for (let n = 1; n <= opts.length; n++) {
          const j = (active + n) % opts.length;
          if (String(options[j].label ?? options[j].v).toLowerCase().startsWith(k)) { move(j); break; }
        }
      }
    });
    el.addEventListener("mousemove", (e) => {
      const o = e.target.closest(".bg-opt");
      if (o && Number(o.dataset.i) !== active) move(Number(o.dataset.i));
    });
    el.addEventListener("click", (e) => {
      const o = e.target.closest(".bg-opt");
      if (o) pick(Number(o.dataset.i));
    });
    pop = { el, trigger };
    el.focus();
  }

  // Outside clicks, scrolling the page and resizing close a menu.
  document.addEventListener("pointerdown", (e) => {
    if (!pop) return;
    if (pop.el.contains(e.target) || pop.trigger?.contains(e.target)) return;
    closePop(false);
  }, true);
  window.addEventListener("resize", () => closePop(false));
  window.addEventListener("scroll", (e) => {
    if (pop && !pop.el.contains(e.target)) closePop(false);
  }, true);

  // ── Export for devs ──────────────────────────────────────────────────────
  /**
   * The export menu: what to export (this view, the selected bugs, every
   * open bug — or, from a run's page, that run's bugs), then the format.
   */
  function openExport(trigger, { preset = "view", runId = "" } = {}) {
    closePop(false);
    const all = models();
    const sets = runId
      ? [{ k: "run", label: "This run's bugs", rows: all.filter((m) => (m.g.runs ?? []).includes(runId)) }]
      : [
          { k: "view", label: "This view", rows: current },
          { k: "picked", label: "Selected bugs", rows: all.filter((m) => st.picked.has(m.key)) },
          { k: "open", label: "All open bugs", rows: all.filter((m) => !CLOSED.has(m.status)) },
        ];
    let pickedSet = sets.find((s) => s.k === preset && s.rows.length) ?? sets.find((s) => s.rows.length) ?? sets[0];
    const el = document.createElement("div");
    el.className = "bg-pop bg-xp";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "Export for devs");
    const name = `bg-xp-${Math.random().toString(36).slice(2, 8)}`;
    const shareHref = runId ? `#/bugs?run=${encodeURIComponent(runId)}` : listHash();
    el.innerHTML =
      `<p class="bg-xp-h" id="${name}-h">What to export</p>` +
      `<div role="radiogroup" aria-labelledby="${name}-h">` +
      sets.map((s) =>
        `<label class="bg-xp-r${s.rows.length ? "" : " is-off"}"><input type="radio" name="${name}" value="${s.k}"` +
        `${s === pickedSet ? " checked" : ""}${s.rows.length ? "" : " disabled"} /><span>${h(s.label)}</span><span class="n">${num(s.rows.length)}</span></label>`).join("") +
      `</div>` +
      (runId && !sets[0].rows.length
        ? `<p class="bg-note" style="margin:6px 8px 0">None of this run's bugs are on the Bugs list. <a class="bg-link" href="/api/bug-report?run=${encodeURIComponent(runId)}" target="_blank" rel="noopener">Open the run's own bug sheet</a></p>`
        : "") +
      `<div class="bg-xp-hr" role="separator"></div>` +
      `<button type="button" class="bg-xp-f" data-fmt="xlsx"><span class="bg-badge">XLSX</span><span><b>Excel sheet</b><small>Same columns, opens in Google Sheets</small></span></button>` +
      `<button type="button" class="bg-xp-f" data-fmt="pdf"><span class="bg-badge">PDF</span><span><b>Dev report</b><small>Each bug with steps, expected vs actual, curl</small></span></button>` +
      `<button type="button" class="bg-xp-f" data-fmt="link"><span class="bg-badge">LINK</span><span><b>Copy share link</b><small>Live view for anyone on the spine.ai server</small></span></button>`;
    document.body.appendChild(el);
    place(el, trigger, 300);
    trigger.setAttribute("aria-expanded", "true");
    const fmts = [...el.querySelectorAll(".bg-xp-f")];
    const sync = () => {
      for (const f of fmts) if (f.dataset.fmt !== "link") f.disabled = !pickedSet.rows.length;
    };
    sync();
    el.addEventListener("change", (e) => {
      const s = sets.find((x) => x.k === e.target.value);
      if (s) { pickedSet = s; sync(); }
    });
    el.addEventListener("click", async (e) => {
      const f = e.target.closest(".bg-xp-f");
      if (!f || f.disabled) return;
      const rows = pickedSet.rows.map(exportRow);
      const what = runId ? `run ${runId}` : pickedSet.label.toLowerCase();
      closePop(true);
      try {
        if (f.dataset.fmt === "xlsx") {
          X().xlsx(rows, { name: fileName(runId), sheet: "Bugs" });
          toast(`Exported ${num(rows.length)} bug${rows.length === 1 ? "" : "s"} to Excel`);
        } else if (f.dataset.fmt === "pdf") {
          X().pdf(rows, { title: runId ? `Bugs from ${runTitle(runById(runId) ?? { id: runId })}` : `Bugs · ${pickedSet.label}`, company: companyName(), what, name: fileName(runId) });
        } else {
          const url = `${location.origin}${location.pathname}${shareHref}`;
          await navigator.clipboard.writeText(url);
          toast("Link copied");
        }
      } catch {
        toast(f.dataset.fmt === "link" ? "Couldn't copy the link" : "Couldn't export");
      }
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); closePop(true); }
      const items = [...el.querySelectorAll("input:not(:disabled), .bg-xp-f:not(:disabled), a")];
      if (e.key === "Tab" && items.length) {
        // Keep the keyboard inside the menu while it is open.
        const i = items.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); items[items.length - 1].focus(); }
        else if (!e.shiftKey && i === items.length - 1) { e.preventDefault(); items[0].focus(); }
      }
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && e.target.classList.contains("bg-xp-f")) {
        e.preventDefault();
        const live = fmts.filter((x) => !x.disabled);
        const i = live.indexOf(e.target);
        live[(i + (e.key === "ArrowDown" ? 1 : -1) + live.length) % live.length]?.focus();
      }
    });
    pop = { el, trigger };
    (el.querySelector("input:checked") ?? fmts[0]).focus();
  }

  const fileName = (runId) => {
    const d = new Date();
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const who = companyName().replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "bugs";
    return runId ? `spine-bugs-${who}-run-${runId.replace(/[^A-Za-z0-9-]+/g, "")}` : `spine-bugs-${who}-${day}`;
  };

  // ── the address ──────────────────────────────────────────────────────────
  function listQuery() {
    const qs = new URLSearchParams();
    if (st.run) qs.set("run", st.run);
    else if (st.scope !== "open") qs.set("scope", st.scope);
    if (st.sev) qs.set("sev", st.sev);
    if (st.kind) qs.set("kind", st.kind);
    if (st.q.trim()) qs.set("q", st.q.trim());
    const s = qs.toString();
    return s ? `?${s}` : "";
  }
  const listHash = () => `#/bugs${listQuery()}`;
  const detailHref = (id) => `#/bugs/${encodeURIComponent(id)}${listQuery()}`;

  function readHash() {
    const m = location.hash.match(/^#\/bugs(?:\/([^?]*))?(?:\?(.*))?$/);
    const qs = new URLSearchParams(m?.[2] ?? "");
    const scope = qs.get("scope");
    st.scope = SCOPE_KEYS.has(scope) ? scope : "open";
    const sev = qs.get("sev");
    st.sev = SEV_KEYS.has(sev) ? sev : "";
    const kind = qs.get("kind");
    st.kind = KIND_KEYS.has(kind) ? kind : "";
    st.q = qs.get("q") ?? "";
    st.run = qs.get("run") ?? "";
    st.openId = m?.[1] ? decodeURIComponent(m[1]) : "";
  }

  /** A filter change: the address follows without a navigation (no scroll to the top). */
  function setFilter(patch) {
    Object.assign(st, patch);
    st.kept.clear();
    history.replaceState(null, "", st.openId ? detailHref(st.openId) : listHash());
    render();
  }

  // ── the bug, opened ──────────────────────────────────────────────────────
  /** Everything a person sets on a bug, in one place: the list shows only what is set. */
  function triageHtml(m) {
    const row = (label, ctl) => `<div class="bg-tr"><span class="bg-tr-l">${label}</span><div class="bg-tr-c">${ctl}</div></div>`;
    return (
      row("Status", pillHtml(m, "status")) + row("Priority", pillHtml(m, "priority")) + row("Blocker", pillHtml(m, "blocker")) +
      row("Dev type", `${pillHtml(m, "devType")}<span class="bg-by" title="${h(m.devBy)}">${h(m.devBy)}</span>`) +
      row("Dev ETA", etaHtml(m)) +
      row("Dev comment", `<input class="bg-comment" type="text" data-field="devComment" value="${h(m.devComment)}" placeholder="Add a comment" aria-label="Dev comment for ${h(m.id)}" maxlength="2000" />`)
    );
  }
  /** The open panel's triage, again after an edit (the row is painted by paintRow). */
  function paintTriage(key) {
    const dr = q$("#bg-drawer");
    if (!dr || dr.hidden || dr.dataset.key !== key) return;
    const g = (st.groups ?? []).find((x) => x.defectFingerprint === key);
    const box = q$(".bg-triage", dr);
    if (g && box && !box.contains(document.activeElement)) box.innerHTML = triageHtml(model(g));
  }
  function drawerHtml(m) {
    const s = storyOf(m);
    const fact = (t) => `<span class="bg-fact">${t}</span>`;
    const sevLabel = SEVS.find(([k]) => k === m.sev)?.[1] ?? m.sev;
    const ours = m.kind === "automation_defect" || m.kind === "environment";
    const scrub = (t) => X()?.scrub(t) ?? t;
    const sec = (title, body) => `<section class="bg-dr-sec"><h3>${h(title)}</h3>${body}</section>`;
    return (
      `<div class="bg-dr-head"><div><div class="bg-l1"><span class="bg-id">${h(m.id)}</span>` +
      `<span class="bg-state st-${m.state.k}" title="${h(m.state.why)}">${h(m.state.word)}</span></div>` +
      `<h2 id="bg-dr-title">${h(m.title)}</h2></div>` +
      `<button type="button" class="bg-dr-x" data-act="close" aria-label="Close ${h(m.id)}">${icon("x")}</button></div>` +
      `<div class="bg-dr-body">` +
      `<div class="bg-dr-facts">` +
      fact(`<span class="bg-sdot s-${m.sev}" aria-hidden="true"></span>${h(sevLabel)}`) +
      fact(h(KIND_LABEL[m.kind] ?? "Product defect")) + fact(h(m.module)) + fact(h(m.userType)) +
      `</div>` +
      `<div class="bg-triage">${triageHtml(m)}</div>` +
      (s.what ? sec("What's wrong", `<p>${h(s.what)}</p>`) : "") +
      (s.where ? sec("Where", `<p>${h(s.where)}</p>`) : "") +
      (s.steps.length ? sec("How to see it", `<ol>${s.steps.map((x) => `<li>${h(x)}</li>`).join("")}</ol>`) : "") +
      (s.expected || s.actual
        ? sec("Expected vs what happens", `<div class="bg-ea">` +
          `<div><b>Expected</b><p>${h(s.expected || "Not recorded")}</p></div>` +
          `<div class="got"><b>What happens</b><p>${h(s.actual || "Not recorded")}</p></div></div>`)
        : "") +
      (s.ways.length
        ? sec(`Ways it happened (${s.ways.length})`, `<ul class="bg-ways">${s.ways.map((w) => `<li><span>${h(w.what)}</span>${w.result ? `<em>${h(w.result)}</em>` : ""}</li>`).join("")}</ul>`)
        : "") +
      sec("How often", `<p>${h(s.often)} ${h(m.state.why)}.</p>`) +
      (s.videos.length || s.replays.length
        ? sec("How it happened", s.videos.map((x) => `<video class="bg-video" src="${h(x.href)}" controls preload="metadata" title="${h(x.label)}"></video>`).join("") +
          `<ul class="bg-art">${[...s.videos.map((x) => `<li><a href="${h(x.href)}" target="_blank" rel="noopener">${h(x.label)}</a></li>`),
            ...s.replays.map((x) => `<li><a href="${h(x.href)}" download>${h(x.label)}</a> — open it at <a href="https://trace.playwright.dev" target="_blank" rel="noopener">trace.playwright.dev</a></li>`)].join("")}</ul>`)
        : "") +
      (s.shots.length
        ? sec("Screenshots", `<div class="bg-shots">${s.shots.map((x) =>
            `<a href="${h(x.href)}" target="_blank" rel="noopener" title="${h(x.label)}"><img src="${h(x.href)}" alt="${h(x.label)}" loading="lazy" /><span>${h(x.label)}</span></a>`).join("")}</div>`)
        : "") +
      (s.links.length
        ? sec("The runs behind it", `<ul class="bg-art">${s.links.map((x) =>
            `<li><a href="${h(x.href)}"${x.href.startsWith("#") ? "" : ' target="_blank" rel="noopener"'}>${h(x.label)}</a></li>`).join("")}</ul>`)
        : "") +
      (s.curl
        ? sec("The exact request", `<pre class="bg-pre">${h(scrub(s.curl))}</pre>` +
          (s.reply ? `<p class="bg-note">The server answered: ${h(scrub(s.reply))}</p>` : "") +
          `<button type="button" class="bg-copy" data-act="copy-curl">Copy command</button>`)
        : "") +
      `<details class="bg-dev"><summary>For developers</summary>` +
      `<p><b>Recorded as</b> <code>${h(scrub(s.techTitle))}</code></p>` +
      (s.devNotes.length ? `<p><b>Notes from the test cases on the likely cause</b></p><ul>${s.devNotes.map((n) => `<li>${h(scrub(n))}</li>`).join("")}</ul>` : "") +
      (s.evidence.length ? `<p><b>Evidence lines</b></p><ul>${s.evidence.map((x) => `<li><code>${h(scrub(x))}</code></li>`).join("")}</ul>` : "") +
      `</details>` +
      (s.writtenBy
        ? `<p class="bg-note">${s.writtenBy === "spine.ai" ? "Written in plain words by spine.ai from this bug's recorded evidence; the evidence above is exactly as recorded." : "The plain write-up is still being prepared; this one is from a template."}</p>`
        : "") +
      `<div class="bg-dr-links">` +
      `<button type="button" class="bg-link" data-act="pdf-one">Export this bug as a PDF</button>` +
      (ours ? `<a href="#/stuck">Stuck points and steps still needed</a>` : "") +
      `</div></div>`
    );
  }

  let lastScroll = 0;
  function syncDrawer() {
    const dr = q$("#bg-drawer");
    const scrim = q$("#bg-scrim");
    if (!dr || !scrim) return;
    const id = onPage() ? st.openId : "";
    const m = id && st.groups ? models().find((x) => x.id === id) : null;
    if (!m) {
      if (!dr.hidden) {
        dr.hidden = true;
        scrim.hidden = true;
        document.documentElement.classList.remove("bg-locked");
        const back = st.lastFocus;
        st.lastFocus = null;
        if (back?.isConnected) back.focus();
        else q$(`#bg-body a.bg-id[href^="#/bugs/${CSS.escape(encodeURIComponent(id || ""))}"]`)?.focus();
      }
      return;
    }
    dr.innerHTML = drawerHtml(m);
    dr.dataset.key = m.key;
    dr.hidden = false;
    scrim.hidden = false;
    q$(".bg-dr-x", dr)?.focus();
  }

  function openDetail(id, from) {
    st.lastFocus = from ?? document.activeElement;
    lastScroll = window.scrollY;
    st.openId = id;
    history.pushState({ bgDetail: true }, "", detailHref(id));
    syncDrawer();
  }
  function closeDetail() {
    if (!st.openId) return;
    if (history.state?.bgDetail) {
      // Back to the list entry it came from; hashchange closes the drawer.
      history.back();
      return;
    }
    st.openId = "";
    history.replaceState(null, "", listHash());
    syncDrawer();
  }

  // ── the client bar sits in this page's header while it is open ───────────
  function placeClientBar() {
    const bar = q$(".ctx-bar");
    const slot = q$("#bg-ctx");
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
    readHash();
    render();
    // "Bugs from this run", opened from a run that just ended: a list loaded
    // before the run was saved does not know it, and read "no bugs in this run"
    // while the export (loaded later) had its rows (15 Oct). Load it again.
    const unknownRun = !!st.run && st.groups != null && st.runChecked !== st.run && !(st.groups ?? []).some((g) => (g.runs ?? []).includes(st.run));
    if (st.run) st.runChecked = st.run;
    if (st.groups == null || st.stale || unknownRun) load();
    else syncDrawer();
  }

  /** A run that just finished may have found, or stopped hitting, a bug. */
  function tick() {
    const open = !!window.spineSession?.open;
    if (st.wasOpen && !open) setTimeout(() => (onPage() ? load() : (st.stale = true)), 1500);
    st.wasOpen = open;
  }

  function init() {
    const body = q$("#bg-body");
    if (!body) return;

    q$("#bg-tiles")?.addEventListener("click", (e) => {
      const t = e.target.closest(".bg-tile");
      if (t) setFilter({ sev: st.sev === t.dataset.sev ? "" : t.dataset.sev });
    });
    q$("#bg-scope")?.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-scope]");
      if (b) setFilter({ scope: b.dataset.scope, run: "" });
    });
    q$("#bg-runchip button")?.addEventListener("click", () => setFilter({ run: "", scope: "open" }));
    q$("#bg-kind")?.addEventListener("click", (e) => {
      const btn = e.currentTarget;
      if (pop?.trigger === btn) return closePop(true);
      openList(btn, {
        label: "Kind",
        options: KINDS.map((x) => ({ v: x.k, label: x.label })),
        current: st.kind,
        onPick: (v) => setFilter({ kind: v }),
      });
    });
    const box = q$("#bg-q");
    let typing = null;
    box?.addEventListener("input", () => {
      clearTimeout(typing);
      typing = setTimeout(() => setFilter({ q: box.value }), 120);
    });
    q$("#bg-export")?.addEventListener("click", (e) => {
      const btn = e.currentTarget;
      if (pop?.trigger === btn) return closePop(true);
      openExport(btn, { preset: "view" });
    });

    // The selection bar.
    q$("#bg-selbar")?.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-bulk]");
      if (!b) return;
      const keys = [...st.picked];
      if (b.dataset.bulk === "clear") {
        st.picked.clear();
        for (const tr of document.querySelectorAll("#bg-body tr.is-picked")) {
          tr.classList.remove("is-picked");
          tr.querySelector('[data-act="pick"]').checked = false;
        }
        paintSelection(current);
        q$("#bg-export")?.focus();
      } else if (b.dataset.bulk === "export") {
        openExport(b, { preset: "picked" });
      } else {
        const field = b.dataset.bulk;
        openList(b, {
          label: `${FIELDS[field].label} for ${keys.length} bugs`,
          options: FIELDS[field].opts,
          current: null,
          mono: FIELDS[field].mono,
          onPick: (v) => saveMany(keys, field, v),
        });
      }
    });

    // The table: ticks, pills, the ETA and comment, the drawer links.
    body.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]");
      const pill = e.target.closest(".bg-pill");
      const tr = e.target.closest("tr[data-key]");
      if (act?.dataset.act === "retry") {
        st.err = false;
        st.groups = null;
        render();
        return void load();
      }
      if (act?.dataset.act === "all") return setFilter({ scope: "all", run: "", sev: "", kind: "", q: "" });
      if (act?.dataset.act === "clear") {
        if (box) box.value = "";
        setFilter({ sev: "", kind: "", q: "" });
        return box?.focus();
      }
      if (act?.dataset.act === "detail" && tr) {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
        e.preventDefault();
        const m = models().find((x) => x.key === tr.dataset.key);
        if (m) openDetail(m.id, act);
        return;
      }
      if (pill && tr) {
        if (pop?.trigger === pill) return closePop(true);
        const field = pill.dataset.field;
        const m = models().find((x) => x.key === tr.dataset.key);
        if (!m) return;
        openList(pill, {
          label: `${FIELDS[field].label} for ${m.id}`,
          options: FIELDS[field].opts,
          current: m[field],
          mono: FIELDS[field].mono,
          onPick: (v) => {
            if (v !== m[field] || field === "devType") save(m.key, field, v);
          },
        });
      }
    });
    body.addEventListener("change", (e) => {
      const t = e.target;
      if (t.dataset.act === "pick-all") {
        for (const m of current) t.checked ? st.picked.add(m.key) : st.picked.delete(m.key);
        for (const tr of body.querySelectorAll("tr[data-key]")) {
          tr.classList.toggle("is-picked", t.checked);
          tr.querySelector('[data-act="pick"]').checked = t.checked;
        }
        return paintSelection(current);
      }
      const tr = t.closest("tr[data-key]");
      if (!tr) return;
      if (t.dataset.act === "pick") {
        t.checked ? st.picked.add(tr.dataset.key) : st.picked.delete(tr.dataset.key);
        tr.classList.toggle("is-picked", t.checked);
        return paintSelection(current);
      }
      if (t.dataset.field === "devEta") {
        const was = st.triage[tr.dataset.key]?.devEta ?? "";
        if (t.value !== was) save(tr.dataset.key, "devEta", t.value);
      }
    });
    // A comment saves on Enter or when the reader leaves the box.
    const commit = (t) => {
      const tr = t.closest("tr[data-key]");
      if (!tr || t.dataset.field !== "devComment") return;
      const was = st.triage[tr.dataset.key]?.devComment ?? "";
      const v = t.value.trim();
      if (v !== was) save(tr.dataset.key, "devComment", v);
    };
    body.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.dataset?.field === "devComment") {
        e.preventDefault();
        commit(e.target);
      } else if (e.key === "Escape" && e.target.dataset?.field === "devComment") {
        const tr = e.target.closest("tr[data-key]");
        e.target.value = st.triage[tr?.dataset.key]?.devComment ?? "";
        e.target.blur();
      }
    });
    body.addEventListener("focusout", (e) => {
      if (e.target.dataset?.field === "devComment") commit(e.target);
    });

    // The drawer.
    const dr = q$("#bg-drawer");
    dr?.addEventListener("click", async (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "close") return closeDetail();
      const m = models().find((x) => x.key === dr.dataset.key);
      if (!m) return;
      const pill = e.target.closest(".bg-pill");
      if (pill) {
        if (pop?.trigger === pill) return closePop(true);
        const field = pill.dataset.field;
        return openList(pill, {
          label: `${FIELDS[field].label} for ${m.id}`,
          options: FIELDS[field].opts,
          current: m[field],
          mono: FIELDS[field].mono,
          onPick: (v) => {
            if (v !== m[field] || field === "devType") save(m.key, field, v);
          },
        });
      }
      if (act === "copy-curl") {
        try {
          await navigator.clipboard.writeText(X()?.scrub(storyOf(m).curl) ?? storyOf(m).curl);
          toast("Command copied");
        } catch {
          toast("Couldn't copy the command");
        }
      } else if (act === "pdf-one") {
        X()?.pdf([exportRow(m)], { title: `${m.id} · ${m.title}`, company: companyName(), what: m.id, name: `spine-bug-${m.id}` });
      }
    });
    dr?.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); closeDetail(); }
      if (e.key === "Tab") {
        // Keep the keyboard in the drawer while it is open.
        const items = [...dr.querySelectorAll("a[href], button:not(:disabled), input")];
        const i = items.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); items[items.length - 1]?.focus(); }
        else if (!e.shiftKey && i === items.length - 1) { e.preventDefault(); items[0]?.focus(); }
      }
    });
    // The panel's ETA and comment save like the row's did: the date on change, the comment on Enter or leaving it.
    dr?.addEventListener("change", (e) => {
      if (e.target.dataset.field !== "devEta") return;
      const key = dr.dataset.key;
      if (e.target.value !== (st.triage[key]?.devEta ?? "")) save(key, "devEta", e.target.value);
    });
    const commitHere = (t) => {
      if (t.dataset.field !== "devComment") return;
      const key = dr.dataset.key;
      const v = t.value.trim();
      if (v !== (st.triage[key]?.devComment ?? "")) save(key, "devComment", v);
    };
    dr?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.dataset?.field === "devComment") {
        e.preventDefault();
        commitHere(e.target);
        e.target.blur();
      }
    });
    dr?.addEventListener("focusout", (e) => commitHere(e.target));
    q$("#bg-scrim")?.addEventListener("click", closeDetail);

    // From a run's page: "Export bugs from this run" (public/session.js).
    document.addEventListener("click", (e) => {
      const b = e.target.closest("[data-bugs-export]");
      if (!b) return;
      e.preventDefault();
      exportRun(b.dataset.bugsExport, b);
    });

    // "/" anywhere on the page goes to the search, unless the reader is typing.
    document.addEventListener("keydown", (e) => {
      if (e.key !== "/" || !onPage() || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target.closest?.("input, textarea, select, [contenteditable='true']")) return;
      e.preventDefault();
      box?.focus();
    });

    // Deferred a tick, like sessions.js: app.js's router marks the view first,
    // and scrolls to the top — the list goes back where it was when a drawer
    // closes.
    window.addEventListener("hashchange", () =>
      setTimeout(() => {
        placeClientBar();
        if (!onPage()) {
          closePop(false);
          if (st.openId) { st.openId = ""; syncDrawer(); }
          return;
        }
        const had = st.openId;
        enter();
        if (had && !st.openId) window.scrollTo({ top: lastScroll, behavior: "instant" });
      }, 0),
    );
    // A different client or environment is a different list.
    const rescope = () => setTimeout(() => {
      if (!onPage()) return void (st.stale = true);
      st.groups = null;
      st.picked.clear();
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

  /**
   * A run's bugs, exported from that run's page.
   *
   * The menu needs the bug list, which can take a few seconds to load. With
   * nothing on screen meanwhile, the button read as dead, and a second click
   * while it loaded closed the menu the first one was about to open. Now the
   * button says it is loading and a click during the wait is the same click.
   */
  let exporting = null;
  async function exportRun(runId, anchor) {
    if (!runId || exporting) return;
    if (pop?.trigger === anchor) return closePop(true);
    if (st.groups == null || st.stale) {
      exporting = anchor;
      const was = anchor?.innerHTML;
      if (anchor) {
        anchor.setAttribute("aria-busy", "true");
        anchor.innerHTML = `${icon("download")}Loading bugs…`;
      }
      try {
        await load();
      } finally {
        exporting = null;
        if (anchor) {
          anchor.removeAttribute("aria-busy");
          anchor.innerHTML = was;
        }
      }
    }
    if (st.groups == null) return toast("Couldn't load bugs", { label: "Retry", run: () => exportRun(runId, anchor) });
    openExport(anchor, { runId });
  }
  /** Load the bug list ahead, once a run's page offers "Export bugs from this run". */
  let prefetched = false;
  new MutationObserver(() => {
    if (prefetched || !document.querySelector("#view-run [data-bugs-export]")) return;
    prefetched = true;
    if (st.groups == null) load();
  }).observe(document.body, { childList: true, subtree: true });

  window.spineBugs = { exportRun, refresh: () => load(), curatedForClient };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
