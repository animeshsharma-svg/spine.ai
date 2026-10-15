/**
 * RUN TESTS (#/run-tests; the view is still called "plan" inside app.js).
 *
 * One screen for what API automation and UI automation did. It owns no run
 * logic and no selection of its own: it ticks features in app.js's `selected`
 * set (so the one-event-type rule and the "always runs" steps keep holding),
 * writes its inputs into the two old views' (hidden) inputs, and calls their
 * run functions — so a run from here sends exactly the requests those
 * screens sent:
 *
 *   API     → runSelectedFeatures()    → /api/features-run (or the RFP suite)
 *   Browser → runSelectedUiJourneys()  → /api/ui-run, one journey at a time
 *   Both    → the API run, then the browser run once it has finished
 *
 * Both run functions open the live session (#/session/{id}) themselves.
 *
 * What it adds on top of those screens:
 *   - the features grouped by P2P stage (the modules /api/features returns,
 *     folded into stages below), with live search;
 *   - "How deep": Main flow or + Edge cases, which is the API run's existing
 *     edges switch (#api-edges → edges=0). The split is real: a case is an
 *     edge case when its id starts with EDGE-, the server's own rule, counted
 *     per feature from /api/catalogue;
 *   - the event setup (line items, quantity, vendors) the runs send;
 *   - the selection and settings remembered per client, and Repeat last run.
 *
 * app.js calls window.spinePlan.render() whenever the features, the browser
 * journeys or the account change (planChanged()).
 */
(function () {
  "use strict";

  const q$ = (sel, root = document) => root.querySelector(sel);
  const h = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const icon = (name, cls = "") => `<svg class="ico ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const fmt = (n) => Number(n || 0).toLocaleString("en-IN");
  const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many}`;
  const read = (fn, fallback) => {
    try { const v = fn(); return v === undefined ? fallback : v; } catch { return fallback; }
  };
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const onPage = () => document.documentElement.dataset.view === "plan";

  // ── app.js state, read defensively ───────────────────────────────────────
  const groups = () => read(() => featureGroups, []) || [];
  const sel = () => read(() => selected, null);
  const flows = () => read(() => uiFlows, []) || [];
  const state = () => read(() => featuresState, "loading");
  const client = () => read(() => currentClient, null);
  const clientKey = () => `${client() ?? ""}${read(() => customBase, "") ? `@${read(() => customBase, "")}` : ""}`;
  const isOff = (f) => f.config?.state === "off";
  const runnable = (f) => f.cases > 0 && !isOff(f);
  const isPre = (f) => !!f.prerequisite && runnable(f);
  const heldBy = (f) => read(() => exclusiveHolder(f, selected, byFeatureId), null);
  const hasJourney = (f) => !!f.uiFlow && flows().some((fl) => fl.key === f.uiFlow);
  /**
   * No journey of its own, but every event journey does it (invite vendors,
   * publish): it IS tested in the browser, by running an event journey. It was
   * labelled "API only", which read as untested in the browser.
   */
  const eventJourneyFor = () => ["events.rfq_only", ...EVENT_FLOWS].find((k) => flows().some((fl) => fl.key === k)) || null;
  const coveredByEvents = (f) => !hasJourney(f) && /event[- ]type journey|event journey/i.test(f.uiCoveredBy || "") && !!eventJourneyFor();
  const inBrowser = (f) => hasJourney(f) || coveredByEvents(f);
  /** The browser journeys load after the features (seconds, for some accounts). */
  const flowsKnown = () => !!read(() => uiFlowsLoaded, true);
  /** Accounts whose API side is the PO flow: the case library cannot run there. */
  const poMode = () => { const bar = q$("#po-bar"); return !!bar && !bar.hidden; };
  const suiteAccount = () => !!read(() => featureSuite, null);
  const canTick = (f) => runnable(f) && !isPre(f) && !heldBy(f) && !poMode();
  const allFeatures = () => groups().flatMap((g) => g.children);

  /** The features picked for the run (not the "always runs" steps), in tree order. */
  function picked() {
    const s = sel();
    if (!s) return [];
    return allFeatures().filter((f) => s.has(f.id) && !f.prerequisite);
  }

  /** app.js's own redraw re-applies the product's rules, updates the badge, and calls render() here. */
  const redrawTree = () => read(() => renderTree(), null);
  function setPicked(id, on) {
    const s = sel();
    if (!s) return;
    on ? s.add(id) : s.delete(id);
    redrawTree();
  }

  // ── the stages: /api/features' modules, in buyer order ───────────────────
  /**
   * 01–07 are the P2P stages. Receiving and finance come after the PO, so they
   * sit with it. The setup modules (master data, users, vendors, platform)
   * belong to no stage but are real features with real cases, so they keep a
   * group of their own rather than becoming unreachable. A module this list
   * does not know lands there too.
   */
  const STAGES = [
    { key: "intake", n: "01", label: "Intake", mods: ["intake"] },
    { key: "pr", n: "02", label: "Purchase request", mods: ["pr"] },
    { key: "event", n: "03", label: "Sourcing event", mods: ["events", "erfx", "eventfeatures", "auction"] },
    { key: "bid", n: "04", label: "Vendor bidding", mods: ["bids"] },
    { key: "evaluate", n: "05", label: "Evaluation", mods: ["evaluation", "negotiation"] },
    { key: "award", n: "06", label: "Award", mods: ["award"] },
    { key: "po", n: "07", label: "Purchase order", mods: ["po", "p2p", "finance"] },
    { key: "setup", n: "08", label: "Setup and admin", mods: ["masterdata", "users", "vendors", "vendorbulk", "platform"] },
  ];
  let stagesFor = null;
  let stagesCache = [];
  function stages() {
    const gs = groups();
    if (stagesFor === gs) return stagesCache;
    stagesFor = gs;
    const placed = new Set();
    stagesCache = STAGES.map((st) => {
      const kids = [];
      const sections = [];
      for (const m of st.mods) {
        const g = gs.find((x) => x.id === m);
        if (g) {
          kids.push(...g.children);
          sections.push({ id: g.id, label: g.label, children: g.children });
          placed.add(g.id);
        }
      }
      return { ...st, children: kids, sections };
    });
    const restGroups = gs.filter((g) => !placed.has(g.id));
    if (restGroups.length) {
      const last = stagesCache[stagesCache.length - 1];
      for (const g of restGroups) {
        last.children.push(...g.children);
        last.sections.push({ id: g.id, label: g.label, children: g.children });
      }
    }
    stagesCache = stagesCache.filter((st) => st.children.length);
    return stagesCache;
  }

  /** The journey's stops, and how far one feature takes an event (as journeyModel.reachFor). */
  const STOPS = ["Draft", "Publish", "Bid", "Evaluate", "Award", "PO"];
  function stopOf(f) {
    const id = f.id;
    const is = (...p) => p.some((x) => id.startsWith(x));
    if (is("po.", "p2p.", "finance.")) return 5;
    if (is("award.") || id === "events.awarding_rule") return 4;
    if (is("evaluation.")) return 3;
    if (is("bids.", "negotiation.", "auction.")) return 2;
    if (is("events.", "erfx.", "eventfeatures.")) return 1;
    if (is("intake.", "pr.")) return 0;
    return -1; // setup and admin: no event
  }

  // ── the edge-case split, from /api/catalogue ─────────────────────────────
  /**
   * Per feature, how many of its cases are edge / negative ones: ids that
   * start with EDGE-, the same rule /api/features-run applies to edges=0.
   * /api/features gives no split, so it is counted from the catalogue (the
   * same case library, scoped to the account). Until that has loaded, the
   * Main flow count reads "—".
   */
  const edge = { key: null, map: null, loading: false, failed: false };
  async function loadEdges() {
    const key = clientKey();
    if (edge.loading || (edge.key === key && (edge.map || edge.failed))) return;
    edge.loading = true;
    try {
      const res = await fetch(`/api/catalogue?c=${encodeURIComponent(String(client() ?? ""))}${read(() => baseParam(), "")}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const body = await res.json();
      // Per feature: its edge and main cases, and how many of each can run
      // here at all — a case that needs a state the run cannot build is
      // reported "not run" with its reason, so it is not promised up front.
      const map = {};
      for (const g of body.groups ?? []) {
        for (const f of g.features ?? g.children ?? []) {
          // why: per depth, the set-aside cases by group (/api/catalogue `aside`).
          const n = { edge: 0, edgeRun: 0, main: 0, mainRun: 0, why: { edge: {}, main: {} } };
          for (const c of f.cases ?? []) {
            const k = /^EDGE-/.test(String(c.id)) ? "edge" : "main";
            n[k] += 1;
            if (c.runnable !== false) n[`${k}Run`] += 1;
            else n.why[k][c.aside || "other"] = (n.why[k][c.aside || "other"] || 0) + 1;
          }
          map[f.id] = n;
        }
      }
      Object.assign(edge, { key, map, failed: false });
    } catch {
      Object.assign(edge, { key, map: null, failed: true });
    } finally {
      edge.loading = false;
    }
    renderPanel();
  }
  /**
   * WHAT THE RUN WILL RUN, ASKED OF THE RUN'S OWN CODE.
   *
   * The counts below were the page's copy of the run's rules, and the copy
   * drifted: "the journey + 4 cases" for a run of 0, "the journey + 1 case"
   * for a run of 35, 16 for a run of 14 (15 Oct). /api/run-preview answers
   * with the features run's own filters, set-aside reasons and case builder,
   * for both depths at once; the copy is only the estimate shown while it loads.
   */
  const preview = { key: null, data: null, asked: null, timer: 0 };
  const previewKey = (list) => `${clientKey()}|${list.map((f) => f.id).sort().join(",")}`;
  function askPreview(list) {
    const key = previewKey(list);
    if (!list.length || preview.asked === key) return;
    preview.asked = key;
    clearTimeout(preview.timer);
    preview.timer = setTimeout(async () => {
      try {
        const qs = `c=${encodeURIComponent(String(client() ?? ""))}&features=${encodeURIComponent(list.map((f) => f.id).join(","))}`;
        const res = await fetch(`/api/run-preview?${qs}${read(() => baseParam(), "")}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (preview.asked !== key) return;
        Object.assign(preview, { key, data });
      } catch {
        // The estimate stays; the next change asks again.
        if (preview.asked === key) preview.asked = null;
        return;
      }
      renderPanel();
    }, 200);
  }

  /**
   * The features the API run WALKS AS THE JOURNEY instead of replaying their
   * library cases (src/checks/journeyModel.ts journeyWalksFeature): ticking one
   * means "walk the collection for that event", and only its edge cases run
   * after it. Counting all their library cases promised "66 cases" for a run
   * that walked a 10-step journey and ran no case (accuracy check P1, 15 Oct).
   */
  const JOURNEY_WALKS = new Set([
    "events.rfp_only", "events.rfq_only", "events.rfp_rfq", "events.rfp_auction", "events.auction_only",
    "events.publish", "events.config", "bids.place", "bids.submit", "evaluation.score",
    "award.proposal", "award.add_response", "award.submit",
    // walked when ticked: the journey adds the step for them
    "bids.surrogate", "bids.counter_offer", "negotiation.counter_offer", "auction.convert", "events.versioning",
  ]);
  /**
   * What the run will really do, per depth: whether it walks the journey, how
   * many cases it runs after it, and how many it sets aside because they need
   * a state it cannot build here. Main flow runs no edge case of any feature
   * (/api/features-run edges=0). Null counts until the catalogue has loaded.
   */
  function caseCounts(list) {
    // The run's own answer (/api/run-preview) once it is in; until then the
    // estimate below, from the catalogue and the page's copy of the rules.
    const key = previewKey(list);
    if (preview.key === key && preview.data) {
      const d = preview.data;
      const shape = (x) => ({ run: x.run, maybe: x.maybe || 0, aside: Object.values(x.aside || {}).reduce((a, b) => a + b, 0), why: x.aside || {} });
      return { journey: !!d.journey, all: shape(d.all), main: shape(d.main), exact: true };
    }
    askPreview(list);
    const journey = list.some((f) => JOURNEY_WALKS.has(f.id));
    if (!edge.map) {
      // Before the split is known: every case of the features the journey does not walk.
      const all = list.filter((f) => !JOURNEY_WALKS.has(f.id)).reduce((n, f) => n + (f.cases || 0), 0);
      return { journey, all: { run: all, aside: 0 }, main: null };
    }
    const all = { run: 0, aside: 0, why: {} };
    const main = { run: 0, aside: 0, why: {} };
    const add = (into, why) => { for (const [k, v] of Object.entries(why || {})) into.why[k] = (into.why[k] || 0) + v; };
    for (const f of list) {
      const n = edge.map[f.id] ?? { edge: 0, edgeRun: 0, main: f.cases || 0, mainRun: f.cases || 0, why: { edge: {}, main: {} } };
      all.run += n.edgeRun;
      all.aside += n.edge - n.edgeRun;
      add(all, n.why?.edge);
      if (JOURNEY_WALKS.has(f.id)) continue;
      all.run += n.mainRun;
      all.aside += n.main - n.mainRun;
      add(all, n.why?.main);
      main.run += n.mainRun;
      main.aside += n.main - n.mainRun;
      add(main, n.why?.main);
    }
    return { journey, all, main };
  }
  /**
   * Why the cases a run will not try are set aside, a group each, biggest
   * first (src/checks/caseLibrary.ts setAsideKind). One reason for all of them
   * read "they need a state this run can't build", also for the 16 cases
   * whose request did not send what they test (15 Oct).
   */
  const ASIDE_WORDS = {
    "as-written": (n) => (n === 1 ? "1 doesn't send what it tests yet" : `${n} don't send what they test yet`),
    state: (n) => `${n} ${n === 1 ? "needs" : "need"} an event state this run can't build`,
    setting: (n) => `${n} ${n === 1 ? "needs" : "need"} a company setting that's off for this account`,
    access: (n) => `${n} ${n === 1 ? "needs" : "need"} a different user or company than this run signs in as`,
    "not-allowed": (n) => `${n} ${n === 1 ? "uses" : "use"} a request the run isn't allowed to send yet`,
    other: (n) => `${n} can't run here`,
  };
  function asideWords(depth, journey) {
    if (!depth) return "";
    const parts = Object.entries(depth.why || {})
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => (ASIDE_WORDS[k] || ASIDE_WORDS.other)(n));
    const aside = depth.aside ? `${plural(depth.aside, "case", "cases")} set aside, not run${parts.length ? `: ${parts.join(", ")}` : ""}.` : "";
    // Waiting on a record: only the run can tell whether an earlier case makes it.
    const maybe = depth.maybe
      ? `${plural(depth.maybe, "more case runs", "more cases run")} only if an earlier ${journey ? "step or case" : "case"} creates the record ${depth.maybe === 1 ? "it needs" : "they need"}.`
      : "";
    return [aside, maybe].filter(Boolean).join(" ");
  }
  /** "the journey + 21 cases", "the journey", "11 cases" — the run as it will go. */
  function runWords(journey, n) {
    if (!journey) return plural(n, "case", "cases");
    return n ? `the journey + ${plural(n, "case", "cases")}` : "the journey";
  }

  // ── what the run sends: depth and the event setup ────────────────────────
  const DEFAULTS = { edges: true, li: 3, mode: "same", same: "10", per: [], v: 3 };
  const inputs = { ...DEFAULTS, per: [] };
  /** Per line, line i (0-based) defaults to 10, 20, 30…; lines after the sixth copy the sixth. */
  const perAt = (i) => { const k = Math.min(i, 5); return inputs.per[k] ?? String((k + 1) * 10); };

  /** The company's ceiling on line items (from its configuration), never above 50. */
  const liMax = () => Math.min(50, Number(read(() => uiLimits?.non_boq, 0)) || Number(q$("#api-line-items")?.max) || 50);

  function quantities() {
    const n = inputs.li;
    if (inputs.mode === "same" || n === 1) return [inputs.same];
    return Array.from({ length: n }, (_, i) => perAt(i));
  }

  function problems() {
    const out = [];
    const max = liMax();
    if (!(Number.isInteger(inputs.li) && inputs.li >= 1 && inputs.li <= max)) out.push(`Line items: a whole number from 1 to ${max}.`);
    if (!(Number.isInteger(inputs.v) && inputs.v >= 1 && inputs.v <= 10)) out.push("Vendors invited: a whole number from 1 to 10.");
    const per = inputs.mode === "per" && inputs.li > 1;
    const boxes = per ? Math.min(inputs.li, 6) : 1;
    for (let i = 0; i < boxes; i++) {
      const v = String(per ? perAt(i) : inputs.same).trim();
      if (!(Number(v) > 0)) out.push(`${per ? `Quantity, line ${i + 1}` : "Quantity"}: a number above 0 (2.5 is fine).`);
    }
    return out;
  }

  // ── remembered per client ────────────────────────────────────────────────
  const KEY = (k) => `spine.runTests.v1.${k}`;
  const LAST = (k) => `spine.runTests.last.v1.${k}`;
  const settings = () => ({ edges: inputs.edges, li: inputs.li, mode: inputs.mode, same: inputs.same, per: inputs.per.slice(0, 6), v: inputs.v });
  function applySettings(s) {
    if (!s) return;
    const int = (x, lo, hi, d) => (Number.isInteger(Number(x)) ? Math.min(hi, Math.max(lo, Number(x))) : d);
    inputs.edges = s.edges !== false;
    inputs.li = int(s.li, 1, liMax(), DEFAULTS.li);
    inputs.mode = s.mode === "per" ? "per" : "same";
    inputs.same = String(s.same ?? DEFAULTS.same);
    inputs.per = Array.isArray(s.per) ? s.per.slice(0, 6).map(String) : [];
    inputs.v = int(s.v, 1, 10, DEFAULTS.v);
  }
  /** A suite account keeps its own inputs in the old screens (app.js): start from those. */
  function seedFromSuite() {
    const n = Math.max(1, Number(q$("#api-line-items")?.value) || 1);
    const qty = String(q$("#api-qty")?.value || DEFAULTS.same).split(",").map((x) => x.trim()).filter(Boolean);
    inputs.li = Math.min(n, liMax());
    inputs.mode = qty.length > 1 && inputs.li > 1 ? "per" : "same";
    inputs.same = qty[0] ?? DEFAULTS.same;
    inputs.per = qty.length > 1 ? qty.slice(0, 6) : [];
    inputs.v = Math.min(10, Math.max(1, Number(q$("#api-vendors")?.value) || DEFAULTS.v));
    inputs.edges = q$("#api-edges")?.checked !== false;
  }
  function tickIds(ids) {
    const s = sel();
    if (!s) return 0;
    let n = 0;
    for (const id of ids ?? []) {
      const f = allFeatures().find((x) => x.id === id);
      if (f && canTick(f)) { s.add(id); n++; } // in order, so the one-event-type rule holds
    }
    return n;
  }

  /** Once per client, when its features are in: its saved selection and settings, else the defaults. */
  let restoredFor = null;
  function restore() {
    if (state() !== "ready" || restoredFor === clientKey()) return false;
    restoredFor = clientKey();
    Object.assign(inputs, DEFAULTS, { per: [] });
    if (suiteAccount()) seedFromSuite();
    const saved = store.get(KEY(restoredFor));
    if (saved && !suiteAccount()) applySettings(saved);
    // A different client is a fresh list: collapsed again.
    openGroups.clear();
    if (saved?.ids?.length && sel() && sel().size === 0 && tickIds(saved.ids)) {
      redrawTree(); // calls render() again, with the selection in place
      return true;
    }
    return false;
  }
  function save() {
    if (restoredFor !== clientKey() || state() !== "ready") return;
    store.set(KEY(restoredFor), { ids: picked().map((f) => f.id), ...settings() });
  }

  // ── focus survives a redraw ──────────────────────────────────────────────
  function rememberFocus() {
    return document.activeElement?.closest?.("#view-plan [data-fk]")?.dataset.fk ?? null;
  }
  function restoreFocus(key) {
    if (key) q$(`#view-plan [data-fk="${CSS.escape(key)}"]`)?.focus();
  }

  // ── the feature list ─────────────────────────────────────────────────────
  // Every stage starts collapsed (Aanya, 2026-10-08): the list reads as its
  // modules first, with each one's ticked count. A stage opens when the
  // reader opens it, ticks its box, searches, or repeats the last run.
  const openGroups = new Set();
  let query = "";

  function tagFor(f) {
    if (isOff(f)) {
      const why = (f.config?.reasons && f.config.reasons[0]) || (f.config?.flag ? `${f.config.flag} is off for this company` : "switched off for this company");
      return `<span class="pl-tag warn" title="${h(why)}">Off for client</span>`;
    }
    if (!(f.cases > 0)) return `<span class="pl-tag" title="No test cases written for this yet">No tests yet</span>`;
    // Two states the product's own rules set; without a word the checkbox would look broken.
    if (isPre(f)) return `<span class="pl-tag" title="Every event goes through this step; it runs with whatever you pick">Always runs</span>`;
    const holder = heldBy(f);
    if (holder) return `<span class="pl-tag" title="An event has one type. Untick “${h(holder.label)}” to pick this instead.">One type per run</span>`;
    if (flowsKnown() && coveredByEvents(f)) return `<span class="pl-tag cov" title="No journey of its own: every event journey does this in the browser, so a UI run runs an RFQ journey for it">In every event journey</span>`;
    if (flowsKnown() && !hasJourney(f)) return `<span class="pl-tag" title="No browser test for this yet. Its API test cases run in an API or Both run; a UI-only run has nothing to open for it.">API tests only</span>`;
    return "";
  }

  function renderList() {
    const box = q$("#pl-groups");
    if (!box) return;
    const st = state();
    if (st === "error") {
      box.setAttribute("aria-busy", "false");
      box.innerHTML = `<p class="pl-msg">Couldn't load features · <button type="button" data-retry>Retry</button></p>`;
      return;
    }
    const ss = stages();
    if (st === "loading" || !ss.length) {
      box.setAttribute("aria-busy", "true");
      box.innerHTML = Array.from({ length: 7 }, () => `<div class="pl-skel"><span class="skel"></span></div>`).join("");
      return;
    }
    box.setAttribute("aria-busy", "false");
    const s = sel();
    const total = ss.reduce((n, g) => n + g.children.length, 0);
    const search = q$("#pl-q");
    if (search) search.placeholder = `Filter ${fmt(total)} features`;

    const q = query.trim().toLowerCase();
    const parts = [];
    for (const g of ss) {
      const shown = q ? g.children.filter((f) => f.label.toLowerCase().includes(q)) : g.children;
      if (q && !shown.length) continue;
      const choosable = g.children.filter((f) => runnable(f) && !isPre(f));
      const on = choosable.filter((f) => s?.has(f.id)).length;
      const open = q ? true : openGroups.has(g.key);
      const row = (f) => {
        const ok = canTick(f);
        const checked = s?.has(f.id) || isPre(f);
        return (
          `<div class="pl-frow${ok ? "" : " is-off"}">` +
          `<label class="pl-flabel"><input type="checkbox" class="pl-cb" data-id="${h(f.id)}" data-fk="f:${h(f.id)}"${checked ? " checked" : ""}${ok ? "" : " disabled"} />` +
          `<span class="pl-fname" title="${h(f.what || f.label)}">${h(f.label)}</span></label>` +
          tagFor(f) +
          `<span class="pl-fn">${f.cases ? fmt(f.cases) : "—"}</span></div>`
        );
      };
      // A stage made of several modules shows each under its own heading, so
      // the event's own features are not mixed with ERFX, add-ons and auctions.
      const secs = (g.sections || []).map((sec) => ({ ...sec, shown: shown.filter((f) => sec.children.includes(f)) })).filter((sec) => sec.shown.length);
      const body =
        secs.length > 1
          ? secs
              .map((sec) => {
                const pick = sec.children.filter((f) => runnable(f) && !isPre(f));
                const n = pick.filter((f) => s?.has(f.id)).length;
                return (
                  `<div class="pl-sub"><span class="pl-subname">${h(sec.label)}</span>` +
                  `<span class="pl-subn${n ? " some" : ""}">${n}/${pick.length}</span></div>` +
                  sec.shown.map(row).join("")
                );
              })
              .join("")
          : shown.map(row).join("");
      const rows = open ? `<div class="pl-frows">${body}</div>` : "";
      parts.push(
        `<div class="pl-group${open ? " open" : ""}" data-group="${h(g.key)}">` +
          `<div class="pl-ghead" data-toggle="${h(g.key)}">` +
          `<input type="checkbox" class="pl-cb pl-gcb" data-gkey="${h(g.key)}" data-fk="g:${h(g.key)}" aria-label="${on ? `Clear ${h(g.label)}` : `Select all in ${h(g.label)}`}"` +
          `${on && on === choosable.length ? " checked" : ""}${choosable.length && !poMode() ? "" : " disabled"} />` +
          `<span class="pl-gnum">${h(g.n)}</span>` +
          `<span class="pl-gname">${h(g.label)}</span>` +
          `<span class="pl-gcount${on ? " some" : ""}"><span class="sr-only">selected </span>${on}/${choosable.length}</span>` +
          `<button type="button" class="pl-gtoggle" data-toggle="${h(g.key)}" data-fk="t:${h(g.key)}" aria-expanded="${open}" aria-label="${open ? "Collapse" : "Expand"} ${h(g.label)}">${icon("chevron-down")}</button>` +
          `</div>${rows}</div>`,
      );
    }
    box.innerHTML = parts.length ? parts.join("") : `<p class="pl-msg">No feature matches “${h(query)}”.</p>`;
    // Indeterminate is a property, not an attribute: some ticked, not all.
    for (const cb of box.querySelectorAll(".pl-gcb")) {
      const g = ss.find((x) => x.key === cb.dataset.gkey);
      const choosable = g ? g.children.filter((f) => runnable(f) && !isPre(f)) : [];
      const on = choosable.filter((f) => s?.has(f.id)).length;
      cb.indeterminate = on > 0 && on < choosable.length;
    }
  }

  // ── the panel ────────────────────────────────────────────────────────────
  /** Time per run type. TODO: run summaries (/api/runs) carry no duration, so these are placeholders. */
  const EST = { api: "~2 min", ui: "~4 min", both: "~6 min" };

  let qtySig = "";
  function renderQty() {
    const per = q$("#pl-qty-per");
    const one = inputs.li < 2;
    if (per) {
      per.disabled = one;
      per.closest("label").title = one ? "Needs at least 2 line items" : "";
    }
    const mode = one ? "same" : inputs.mode;
    for (const r of document.querySelectorAll('input[name="pl-qty-mode"]')) r.checked = r.value === mode;
    const sig = `${mode}|${mode === "same" ? 1 : Math.min(inputs.li, 6)}|${inputs.li > 6 ? inputs.li : ""}`;
    const box = q$("#pl-qty-boxes");
    if (!box || sig === qtySig) return;
    qtySig = sig;
    if (mode === "same") {
      box.innerHTML =
        `<div class="pl-qty-same"><input class="pl-qinput" data-q="same" data-fk="q:same" inputmode="decimal" value="${h(inputs.same)}" aria-label="Quantity on each line" />` +
        `<span class="pl-suffix">each line</span></div>`;
      return;
    }
    const n = Math.min(inputs.li, 6);
    box.innerHTML =
      `<div class="pl-qty-grid">${Array.from({ length: n }, (_, i) =>
        `<label class="pl-qty-cell"><span>L${i + 1}</span><input class="pl-qinput" data-q="${i}" data-fk="q:${i}" inputmode="decimal" value="${h(perAt(i))}" aria-label="Quantity on line ${i + 1}" /></label>`,
      ).join("")}</div>` +
      (inputs.li > 6 ? `<p class="pl-qty-note">Lines 7–${inputs.li} copy line 6</p>` : "");
  }

  function renderSteppers() {
    const max = liMax();
    const li = q$("#pl-li");
    const v = q$("#pl-v");
    if (li && document.activeElement !== li) li.value = String(inputs.li);
    if (v && document.activeElement !== v) v.value = String(inputs.v);
    for (const b of document.querySelectorAll('#view-plan [data-step="li"]')) {
      const down = b.dataset.dir === "-1";
      b.disabled = down ? inputs.li <= 1 : inputs.li >= max;
      b.title = down ? "Fewer line items (min 1)" : `More line items (max ${max})`;
    }
    for (const b of document.querySelectorAll('#view-plan [data-step="v"]')) {
      const down = b.dataset.dir === "-1";
      b.disabled = down ? inputs.v <= 1 : inputs.v >= 10;
      b.title = down ? "Fewer vendors (min 1)" : "More vendors (max 10)";
    }
  }

  function renderDepth(counts) {
    for (const card of document.querySelectorAll("#view-plan .pl-dcard")) {
      const on = (card.dataset.depth === "edges") === inputs.edges;
      card.setAttribute("aria-checked", String(on));
      card.tabIndex = on ? 0 : -1;
    }
    const main = q$("#pl-dn-main");
    if (main) main.textContent = counts.main == null ? "— cases" : runWords(counts.journey, counts.main.run);
    const all = q$("#pl-dn-edges");
    if (all) all.textContent = runWords(counts.journey, counts.all.run);
  }

  function renderTrack(list) {
    const far = list.reduce((m, f) => Math.max(m, stopOf(f)), -1);
    const track = q$("#pl-track");
    if (!track) return;
    for (const li of track.children) {
      const i = Number(li.dataset.stop);
      li.classList.toggle("is-done", i <= far);
      li.classList.toggle("is-far", i === far);
      li.classList.toggle("is-ahead", i > far);
    }
    track.setAttribute("aria-label", far >= 0 ? `How far the run takes an event: up to ${STOPS[far]}` : "How far the run takes an event: nothing selected yet");
  }

  let menuOpen = false;
  function renderPanel() {
    const list = picked();
    const N = list.length;
    const M = list.filter(inBrowser).length;
    const counts = caseCounts(list);
    const depth = inputs.edges ? counts.all : counts.main;
    // The big number is what runs: the journey counts as one, then each case.
    const shown = depth == null ? null : depth.run + (counts.journey ? 1 : 0);

    const big = q$("#pl-big");
    if (big) big.textContent = state() === "ready" && shown != null ? fmt(shown) : "—";
    const bigC = q$("#pl-big-c");
    // Said as it will run: a ticked event feature is walked as the journey, not
    // replayed case by case, and a case that cannot run here is not promised.
    if (bigC) {
      const from = `from ${plural(N, "feature", "features")}`;
      bigC.textContent =
        depth == null ? `cases ${from}`
        : counts.journey ? `= ${runWords(true, depth.run)}, ${from}`
        : `cases ${from}`;
    }
    // The cases the run will not try, and why, on a line of their own.
    const asideEl = q$("#pl-aside");
    if (asideEl) {
      const text = state() === "ready" && N ? asideWords(depth, counts.journey) : "";
      asideEl.textContent = text;
      asideEl.hidden = !text;
    }
    renderTrack(list);
    renderDepth(counts);
    renderSteppers();
    renderQty();

    const errs = problems();
    const errBox = q$("#pl-errors");
    if (errBox) {
      errBox.hidden = !errs.length;
      errBox.textContent = errs.join(" ");
    }

    const po = q$("#pl-po");
    if (po) {
      po.hidden = !poMode();
      if (poMode()) {
        q$("#pl-po-text").textContent =
          `This account runs the purchase-order flow through the API, not the case library. ${q$("#po-what")?.textContent ?? ""}`.trim();
        const btn = q$("#pl-po-run");
        const real = q$("#po-run");
        if (btn && real) { btn.disabled = !!real.disabled; btn.title = real.title || ""; }
      }
    }

    const run = q$("#pl-run");
    if (run) {
      run.disabled = !N || errs.length > 0;
      run.title = !N ? "Tick at least one feature" : errs.length ? "Fix the settings in red first" : "";
      run.setAttribute("aria-expanded", String(menuOpen));
      q$("#pl-run-text").textContent = menuOpen
        ? "Choose how to run"
        : depth != null && N ? `Run ${runWords(counts.journey, depth.run)}` : `Run ${plural(N, "feature", "features")}`;
      q$("#pl-run-ico")?.setAttribute("href", menuOpen ? "#i-chevron-down" : "#i-chevron-up");
    }
    if (run?.disabled && menuOpen) closeMenu(false);

    const menu = q$("#pl-menu");
    if (menu && menuOpen) {
      const apiOff = poMode() ? "This account runs PO automation instead" : "";
      const known = flowsKnown();
      const item = (mode, label, detail, why) =>
        `<button type="button" class="pl-mi" role="menuitem" data-mode="${mode}" tabindex="-1"${why ? ` disabled title="${h(why)}"` : ""}>` +
        `<span class="pl-mi-label">${label}</span><span class="pl-mi-n">${h(detail)}</span>${icon("chevron-right")}</button>`;
      const rows = [item("api", "API", `${plural(N, "feature", "features")} · ${EST.api}`, apiOff)];
      // Browser and Both only when a ticked feature has a browser test (or that is still being found out).
      if (!known) {
        rows.push(item("ui", "Browser", "checking…", "Still checking which features have a browser test"));
      } else if (M > 0) {
        rows.push(item("ui", "Browser", `${plural(M, "feature", "features")} · ${EST.ui}`, ""));
        rows.push(item("both", "Both", `${fmt(N)} + ${fmt(M)} · ${EST.both}`, apiOff));
      }
      menu.innerHTML = rows.join("");
    }

    renderRepeat();
  }

  // ── the run menu ─────────────────────────────────────────────────────────
  function openMenu() {
    menuOpen = true;
    q$("#pl-menu").hidden = false;
    renderPanel();
    q$("#pl-menu .pl-mi:not(:disabled)")?.focus();
  }
  function closeMenu(focusButton) {
    if (!menuOpen) return;
    menuOpen = false;
    const menu = q$("#pl-menu");
    if (menu) menu.hidden = true;
    renderPanel();
    if (focusButton) q$("#pl-run")?.focus();
  }

  /** Copies this screen's inputs into the old views' inputs, which the run functions read. */
  function applyInputs() {
    const n = inputs.li;
    const qty = quantities().join(",");
    const same = inputs.mode === "same" || n === 1;
    const set = (s, v) => { const e = q$(s); if (e) e.value = String(v); };
    set("#api-line-items", n);
    const sameBox = q$("#api-qty-same");
    if (sameBox) sameBox.checked = same;
    set("#api-qty", qty);
    set("#api-vendors", inputs.v);
    const edges = q$("#api-edges");
    if (edges) edges.checked = inputs.edges;
    // The old quantity boxes keep what they hold and write it back over #api-qty /
    // #ui-qty, so empty them first: the redraw then starts from this page's values.
    const clear = (s) => { const e = q$(s); if (e) e.innerHTML = ""; };
    clear("#api-qty-boxes");
    read(() => syncApiInputs(), null);
    set("#li-normal", n);
    const uiSame = q$("#ui-qty-same");
    if (uiSame) uiSame.checked = same;
    set("#ui-qty", qty);
    set("#ui-vendors", inputs.v);
    clear("#ui-qty-boxes");
    read(() => renderUiQtyBoxes(), null);
    const login = q$("#ui-login");
    if (login) login.checked = true; // sign in on screen, always, from here
  }

  /** What Repeat last run brings back: kept when a run starts from here. */
  const keepLast = () => store.set(LAST(clientKey()), { ids: picked().map((f) => f.id), ...settings(), at: Date.now() });

  function startApi() {
    applyInputs();
    const errs = read(() => validateApiInputs(), []) || [];
    if (errs.length) {
      const box = q$("#pl-errors");
      if (box) { box.hidden = false; box.textContent = errs.join(" "); }
      return false;
    }
    read(() => runSelectedFeatures(), null);
    return true;
  }

  /**
   * One event, start to finish. An event-type journey already builds its event
   * with the line items asked for, so the multi-line-item journey adds nothing
   * beside it; and "Place a bid" is the invited vendors bidding on THAT event
   * (the journey goes on after publishing), not a second journey that builds an
   * event of its own. Journeys that are not about the same event still run
   * one after another.
   */
  const EVENT_FLOWS = ["events.rfp_only", "events.rfq_only", "events.rfp_rfq", "events.rfp_auction", "events.rfq_auction", "events.auction_rank"];
  function foldJourneys(keys) {
    let out = [...keys];
    const typed = out.some((k) => EVENT_FLOWS.includes(k));
    if (typed) out = out.filter((k) => k !== "events.multi_product");
    const builder = out.some((k) => EVENT_FLOWS.includes(k) || k === "events.multi_product");
    let bidders = 0;
    if (builder && out.includes("bid.submit")) {
      out = out.filter((k) => k !== "bid.submit");
      bidders = 1;
    }
    return { keys: out, bidders };
  }

  function startUi() {
    applyInputs();
    const own = [...new Set(picked().filter(hasJourney).map((f) => f.uiFlow))];
    // Invite vendors / Publish event: run by an event journey, when none is picked already.
    if (picked().some(coveredByEvents) && !own.some((k) => EVENT_FLOWS.includes(k))) own.push(eventJourneyFor());
    const { keys, bidders } = foldJourneys(own.filter(Boolean));
    if (!keys.length) return false;
    const ui = read(() => uiSelected, null);
    if (!ui) return false;
    ui.clear();
    keys.forEach((k) => ui.add(k));
    read(() => runSelectedUiJourneys(undefined, { bidders }), null);
    return true;
  }

  /** API first; the browser run starts once the API run has finished. */
  function startBoth() {
    if (!startApi()) return;
    const began = Date.now();
    const wait = setInterval(() => {
      if (Date.now() - began < 1500) return;
      if (read(() => runLive, false)) return;
      clearInterval(wait);
      startUi();
    }, 1000);
  }

  function choose(mode) {
    closeMenu(false);
    keepLast();
    if (mode === "api") startApi();
    else if (mode === "ui") startUi();
    else if (mode === "both") startBoth();
  }

  // ── Repeat last run ──────────────────────────────────────────────────────
  /**
   * The last run started from this page on this client (its features and
   * settings, kept in this browser); failing that, the features of this
   * client's last feature run in /api/runs, which records no settings.
   */
  let fromRuns = { key: null, ids: null, at: 0, loading: false };
  async function loadLastRun() {
    const key = clientKey();
    if (client() == null || fromRuns.loading) return;
    if (fromRuns.key === key && Date.now() - fromRuns.at < 30000) return;
    fromRuns.loading = true;
    try {
      const { runs } = await (await fetch("/api/runs", { cache: "no-store" })).json();
      const name = String(read(() => currentClientName, "") || "").trim().toLowerCase();
      const mine = (runs ?? [])
        .filter((r) => (r.kind === "api" || !r.kind) && /^\s*features\s*:/i.test(r.request || ""))
        .filter((r) => { const n = String(r.companyName ?? "").trim().toLowerCase(); return n === name || n === String(client()); })
        .sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
      const ids = mine[0] ? mine[0].request.replace(/^\s*features\s*:\s*/i, "").split(",").map((x) => x.trim()).filter(Boolean) : null;
      fromRuns = { key, ids, at: Date.now(), loading: false };
    } catch {
      fromRuns = { key, ids: null, at: Date.now(), loading: false };
    }
    renderRepeat();
  }
  function lastRun() {
    const kept = store.get(LAST(clientKey()));
    if (kept?.ids?.length) return kept;
    if (fromRuns.key === clientKey() && fromRuns.ids?.length) return { ids: fromRuns.ids };
    return null;
  }
  /** "Clear", beside Repeat last run: shown while anything is ticked. */
  function renderClear() {
    const btn = q$("#pl-clear");
    if (!btn) return;
    const n = picked().length;
    btn.hidden = !n || poMode();
    btn.title = n ? `Untick all ${plural(n, "feature", "features")} (steps that always run stay)` : "";
  }
  function clearAll() {
    const s = sel();
    if (!s) return;
    for (const f of allFeatures()) if (!isPre(f)) s.delete(f.id);
    redrawTree();
    // The button hides itself; the search is where picking starts again.
    q$("#pl-q")?.focus();
  }

  function renderRepeat() {
    renderClear();
    const btn = q$("#pl-repeat");
    if (!btn) return;
    const last = lastRun();
    const usable = (last?.ids || []).filter((id) => allFeatures().some((f) => f.id === id && runnable(f) && !isPre(f)));
    btn.hidden = !usable.length || poMode();
    btn.title = usable.length ? `Pick the ${plural(usable.length, "feature", "features")} from the last run on this client again${last.li ? ", with its settings" : ""}` : "";
  }
  function repeatLast() {
    const s = sel();
    const last = lastRun();
    if (!s || !last) return;
    if (last.li) applySettings(last);
    qtySig = "";
    s.clear();
    tickIds(last.ids);
    for (const st of stages()) if (st.children.some((f) => s.has(f.id))) openGroups.add(st.key);
    redrawTree();
  }

  // ── the client bar sits in this page's header while it is open ───────────
  function placeClientBar() {
    const bar = q$(".ctx-bar");
    const slot = q$("#pl-ctx");
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

  // ── render ───────────────────────────────────────────────────────────────
  function render() {
    if (restore()) return; // it redraws the tree, which renders again
    const focus = rememberFocus();
    renderList();
    renderPanel();
    restoreFocus(focus);
    save();
    if (onPage()) {
      placeClientBar();
      loadLastRun();
      if (state() === "ready") loadEdges();
    }
  }

  // ── events ───────────────────────────────────────────────────────────────
  function init() {
    const view = q$("#view-plan");
    if (!view) return;

    q$("#pl-q")?.addEventListener("input", (e) => {
      query = e.target.value;
      renderList();
    });

    const list = q$("#pl-groups");
    list?.addEventListener("change", (e) => {
      const cb = e.target.closest(".pl-cb");
      if (!cb) return;
      if (cb.classList.contains("pl-gcb")) {
        const g = stages().find((x) => x.key === cb.dataset.gkey);
        const s = sel();
        if (!g || !s) return;
        const kids = g.children.filter((f) => runnable(f) && !isPre(f));
        // Decided by what was ticked before the click, not by the box's new
        // state: a part-ticked box ("−") clears its group in one click, the
        // way a mail list's select box does; an empty one ticks them all.
        if (!kids.some((f) => s.has(f.id))) {
          tickIds(kids.map((f) => f.id));
          openGroups.add(g.key);
        } else {
          for (const f of kids) s.delete(f.id);
        }
        redrawTree();
        return;
      }
      setPicked(cb.dataset.id, cb.checked);
    });
    list?.addEventListener("click", (e) => {
      if (e.target.closest("[data-retry]")) {
        read(() => loadFeatures(), null);
        return;
      }
      if (e.target.closest(".pl-cb, .pl-frows")) return;
      const t = e.target.closest("[data-toggle]");
      if (!t) return;
      const key = t.dataset.toggle;
      openGroups.has(key) ? openGroups.delete(key) : openGroups.add(key);
      const focus = rememberFocus();
      renderList();
      restoreFocus(focus);
    });

    // How deep: a radio group (arrow keys move the choice, as radios do).
    const depth = q$("#view-plan .pl-depth");
    const setDepth = (edges, focus) => {
      inputs.edges = edges;
      renderPanel();
      save();
      if (focus) q$(`#view-plan .pl-dcard[data-depth="${edges ? "edges" : "main"}"]`)?.focus();
    };
    depth?.addEventListener("click", (e) => {
      const card = e.target.closest(".pl-dcard");
      if (card) setDepth(card.dataset.depth === "edges", false);
    });
    depth?.addEventListener("keydown", (e) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
      e.preventDefault();
      setDepth(!inputs.edges, true);
    });

    // Steppers and their number boxes.
    view.addEventListener("click", (e) => {
      const b = e.target.closest(".pl-step");
      if (!b || b.disabled) return;
      const d = Number(b.dataset.dir);
      if (b.dataset.step === "li") inputs.li = Math.min(liMax(), Math.max(1, (inputs.li || 1) + d));
      else inputs.v = Math.min(10, Math.max(1, (inputs.v || 1) + d));
      renderPanel();
      save();
    });
    const numberBox = (id, key, lo, hiFn) => {
      const box = q$(id);
      box?.addEventListener("input", () => {
        const n = Number(box.value.trim());
        inputs[key] = Number.isInteger(n) ? n : NaN;
        box.setAttribute("aria-invalid", String(!(Number.isInteger(n) && n >= lo && n <= hiFn())));
        renderPanel();
      });
      box?.addEventListener("blur", () => {
        const n = Number(box.value.trim());
        inputs[key] = Math.min(hiFn(), Math.max(lo, Number.isInteger(n) ? n : lo));
        box.value = String(inputs[key]);
        box.removeAttribute("aria-invalid");
        renderPanel();
        save();
      });
    };
    numberBox("#pl-li", "li", 1, liMax);
    numberBox("#pl-v", "v", 1, () => 10);

    // Quantity: Same or Per line, and its boxes.
    for (const r of document.querySelectorAll('input[name="pl-qty-mode"]')) {
      r.addEventListener("change", () => {
        inputs.mode = r.value;
        renderPanel();
        save();
      });
    }
    q$("#pl-qty-boxes")?.addEventListener("input", (e) => {
      const box = e.target.closest(".pl-qinput");
      if (!box) return;
      const v = box.value.trim();
      if (box.dataset.q === "same") inputs.same = v;
      else inputs.per[Number(box.dataset.q)] = v;
      box.setAttribute("aria-invalid", String(!(Number(v) > 0)));
      renderPanel();
      save();
    });

    q$("#pl-repeat")?.addEventListener("click", repeatLast);
    q$("#pl-clear")?.addEventListener("click", clearAll);
    q$("#pl-po-run")?.addEventListener("click", () => q$("#po-run")?.click());

    // The run button and its menu.
    q$("#pl-run")?.addEventListener("click", () => (menuOpen ? closeMenu(true) : openMenu()));
    q$("#pl-menu")?.addEventListener("click", (e) => {
      const item = e.target.closest(".pl-mi");
      if (item && !item.disabled) choose(item.dataset.mode);
    });
    q$("#pl-menu")?.addEventListener("keydown", (e) => {
      const items = [...q$("#pl-menu").querySelectorAll(".pl-mi:not(:disabled)")];
      const i = items.indexOf(document.activeElement);
      const go = (n) => { e.preventDefault(); items[(n + items.length) % items.length]?.focus(); };
      if (e.key === "ArrowDown") go(i + 1);
      else if (e.key === "ArrowUp") go(i - 1);
      else if (e.key === "Home") go(0);
      else if (e.key === "End") go(items.length - 1);
      else if (e.key === "Escape") { e.preventDefault(); closeMenu(true); }
      else if (e.key === "Tab") closeMenu(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && menuOpen) { e.preventDefault(); closeMenu(true); }
    });
    document.addEventListener("pointerdown", (e) => {
      if (menuOpen && !e.target.closest("#pl-menu, #pl-run")) closeMenu(false);
    });
    window.addEventListener("hashchange", () =>
      setTimeout(() => {
        if (menuOpen) closeMenu(false);
        placeClientBar();
        if (onPage()) {
          render();
        }
      }, 0),
    );

    render();
  }

  window.spinePlan = { render };
  init();
})();
