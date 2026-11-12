/**
 * PRD → TEST CASES — the "PRD" screen (Aanya, 10 Nov: "provide our chatbot the PRD … the agent makes
 * testcases out of the prd which covers all positive negative boundary regression cases, and gives user
 * the option to run all cases, or happy flow or selected cases").
 *
 * Left: drop a PRD (PDF, Word, Markdown, text) or paste it, name it, pick the client, press Write test
 * cases; under it, the PRDs read so far. Right: the PRD's rules and how many the cases cover, filter
 * chips (All · Positive · Negative · Boundary · Edge · Regression), the cases as the same cards the Test
 * cases tab shows, each with a tick, and Run all / Run positive / Run selected.
 *
 * Running hands the set to the Test cases tab (runCases.js, window.spineRunCases): the session screen
 * opens, the cases run one by one as turns, and every Pass/Fail waits for a person to approve it, as a
 * run's cases do. Results are kept with the set (key prd-…), so this screen shows them when reopened.
 */
(function () {
  const h = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const ico = (name) => `<svg class="ico" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const rich = (s) => h(s).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  const TYPE_TONE = { Positive: "pos", Negative: "neg", Edge: "edge", Boundary: "bnd", Regression: "reg" };
  const FILTERS = [["all", "All"], ["Positive", "Positive"], ["Negative", "Negative"], ["Boundary", "Boundary"], ["Edge", "Edge"], ["Regression", "Regression"]];

  const S = { list: [], cur: null, busy: null, err: null, step: "start", choice: null, where: null, filter: "all", sel: new Set(), open: new Set(), rulesOpen: false, clients: [], pasting: false };
  const root = () => document.getElementById("prd-root");

  // ── data ──────────────────────────────────────────────────────────────────
  async function loadList() {
    try {
      const r = await fetch("/api/prd");
      const d = await r.json();
      S.list = Array.isArray(d.prds) ? d.prds : [];
    } catch {
      S.list = [];
    }
  }
  async function loadClients() {
    if (S.clients.length) return;
    try {
      const d = await (await fetch("/api/clients")).json();
      S.clients = (d.clients || []).map((c) => ({ id: c.id ?? c.companyId, name: c.name })).filter((c) => c.id && c.name);
      S.defaultClient = d.defaultClient;
    } catch {
      S.clients = [];
    }
  }
  async function openPrd(id) {
    S.err = null;
    S.sel.clear();
    S.open.clear();
    S.filter = "all";
    try {
      const r = await fetch(`/api/prd?id=${encodeURIComponent(id)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "could not open it");
      S.cur = d;
      S.step = "cases";
    } catch (e) {
      S.err = e.message;
    }
    paint();
  }
  const readFile = (f) =>
    new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result).split(",")[1] || "");
      fr.onerror = () => rej(new Error("the file could not be read"));
      fr.readAsDataURL(f);
    });
  async function write(file, text, name = "") {
    text = (text || "").trim();
    if (!file && text.length < 200) {
      S.err = "Paste at least a few paragraphs of the PRD, or upload the file.";
      return paint();
    }
    const client = S.clients.find((c) => String(c.id) === String(document.getElementById("client")?.value));
    S.busy = { what: file ? `Reading “${file.name}”` : "Reading the PRD", since: Date.now(), said: file ? `Here is the PRD: ${file.name}` : "Here is the PRD (pasted)" };
    S.err = null;
    S.pasting = false;
    paint();
    try {
      const body = { name: (name || S.named || "").trim(), companyId: client?.id, company: client?.name };
      if (file) {
        body.fileName = file.name;
        body.fileBase64 = await readFile(file);
      } else body.text = text;
      const r = await fetch("/api/prd", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok && !d.prd) throw new Error(d.error || "the cases could not be written");
      S.cur = d;
      S.err = d.error || null;
      S.step = "cases";
      S.typed = "";
      S.named = "";
      S.sel.clear();
      S.open.clear();
      S.filter = "all";
      await loadList();
    } catch (e) {
      S.err = e.message;
    }
    S.busy = null;
    paint();
  }
  async function again() {
    if (!S.cur) return;
    S.busy = { what: "Writing the cases again", since: Date.now() };
    paint();
    try {
      const r = await fetch("/api/prd", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: S.cur.prd.id, again: true }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "the cases could not be written again");
      S.cur = d;
      S.sel.clear();
      await loadList();
    } catch (e) {
      S.err = e.message;
    }
    S.busy = null;
    paint();
  }
  async function forget() {
    if (!S.cur || !confirm(`Forget “${S.cur.prd.name}” and its test cases?`)) return;
    await fetch(`/api/prd?id=${encodeURIComponent(S.cur.prd.id)}`, { method: "DELETE" }).catch(() => {});
    S.cur = null;
    await loadList();
    paint();
  }

  // ── running ───────────────────────────────────────────────────────────────
  /** The set as the Test cases tab keeps one; the tab runs it, reviews it and saves its results under the same key. */
  function setFor() {
    const d = S.cur;
    return {
      key: d.prd.key,
      savedAt: d.savedAt || "",
      cases: d.cases.map((c) => ({ ...c, keep: c.keep !== false, unconfirmed: /\(to confirm\)/i.test(c.expected || "") })),
      note: d.prd.note || "",
      ask: `PRD: ${d.prd.name}`,
      source: null,
    };
  }
  function run(idx) {
    const ss = window.spineSession;
    const rc = window.spineRunCases;
    if (!ss || !rc) return alert("The session screen is not loaded yet — try again in a moment.");
    // A run still open in this tab: usually a real one, sometimes a stale one whose end never
    // arrived (the server restarted under it). Offer to stop it rather than refuse (12 Nov).
    if (ss.open) {
      if (!confirm("A run is still going in this tab. Stop it and run the PRD's cases instead?")) return;
      ss.stopNow?.();
    }
    if (!idx.length) return;
    if (!ss.on) {
      ss.begin({ text: `Test cases from the PRD “${S.cur.prd.name}”`, mode: "ui", kind: "prd" });
      ss.idle();
    }
    const set = rc.show(setFor());
    location.hash = ss.id ? `#/session/${encodeURIComponent(ss.id)}` : "#/run";
    setTimeout(() => {
      const show = document.getElementById("ss-show-right");
      if (show && !show.hidden) show.click();
      document.querySelector('.ss-tab[data-tab="cases"]')?.click();
      rc.enqueue(set, idx);
    }, 150);
  }

  // ── the screen ────────────────────────────────────────────────────────────
  // Home's own shape (home.css): a centred head, one card to act in, a recent list. Then, with a PRD open:
  // the stat tiles (which are the kind filters), the cases, and a bar that asks what to run — and where.
  const isSug = (c) => /^suggested$/i.test(c.status || "");
  function state(c) {
    if (/^pass/i.test(c.status || "")) return "pass";
    if (/^fail/i.test(c.status || "")) return "fail";
    if (/not tested|not reached|not run|stopped/i.test(c.status || "")) return "warn";
    return "todo";
  }
  const when = (s) => (s ? new Date(s).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const KIND = { Positive: ["Positive", "pos"], Negative: ["Negative", "neg"], Boundary: ["Boundary", "bnd"], Edge: ["Edge", "edge"], Integration: ["Integration", "int"], Security: ["Security", "sec"], Performance: ["Performance", "perf"], Regression: ["Regression", "reg"], "Bug-confirm": ["Bug-confirm", "bug"], Observation: ["Observation", "obs"] };
  const search = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`;
  const targetWords = () => {
    const name = document.getElementById("ctx-client-name")?.textContent?.trim() || "Client";
    const env = document.getElementById("ctx-env-name")?.textContent?.trim() || "UAT";
    return `${name} · ${env}`;
  };

  let tick = 0;
  function paint() {
    const el = root();
    if (!el) return;
    const typed = el.querySelector("[name=text]")?.value ?? S.typed ?? "";
    const named = el.querySelector("[name=name]")?.value ?? S.named ?? "";
    el.innerHTML = S.cur && !S.busy ? opened() : landing();
    const t = el.querySelector("[name=text]");
    if (t) t.value = typed;
    const n = el.querySelector("[name=name]");
    if (n) n.value = named;
    clearInterval(tick);
    if (S.busy) tick = setInterval(() => { const b = el.querySelector(".prd-progress"); if (b) b.outerHTML = progress(); }, 2000);
    wire(el);
  }

  // ── landing: head, the card, recent PRDs ─────────────────────────────────
  function landing() {
    return (
      `<div class="prd-col">` +
      `<header class="prd-head"><span class="prd-mark" aria-hidden="true">${ico("file-text")}</span>` +
      `<h1>Turn a PRD into test cases</h1>` +
      `<p>Drop the document. spine.ai reads its rules, writes the cases, and runs the ones you choose.</p>` +
      `<ol class="home-steps"><li><span class="hs-n">01</span>Reads every rule</li><li><span class="hs-n">02</span>Writes positive, negative, boundary and regression cases</li><li><span class="hs-n">03</span>Runs what you pick, with proof</li></ol>` +
      `</header>` +
      (S.busy ? progress() : askCard()) +
      (S.err && !S.busy ? `<p class="prd-msg bad">${h(S.err)}</p>` : "") +
      recent() +
      `</div>`
    );
  }

  function askCard() {
    const ready = !!S.file || (S.typed || "").trim().length >= 200;
    return (
      `<section class="prd-ask${S.over ? " over" : ""}" id="prd-ask">` +
      (S.pasting
        ? `<textarea name="text" rows="9" placeholder="Paste the PRD's text here — the whole document, headings and all."></textarea>`
        : `<label class="prd-drop${S.file ? " has" : ""}" id="prd-drop"><input type="file" id="prd-file" accept=".pdf,.docx,.doc,.rtf,.md,.txt,.html" hidden>` +
          (S.file
            ? `<span class="prd-fileico">${ico("file-text")}</span><b>${h(S.file.name)}</b><span>${Math.round(S.file.size / 1024)} KB · click to pick another</span>`
            : `<span class="prd-fileico">${ico("upload")}</span><b>Drop a PRD here</b><span>or <u>choose a file</u> · PDF, Word, Markdown or text</span>`) +
          `</label>`) +
      `<div class="prd-ask-foot">` +
      `<button type="button" class="prd-ghost" id="prd-paste">${S.pasting ? `${ico("upload")}Use a file instead` : "Paste text instead"}</button>` +
      (S.pasting ? `<input type="text" name="name" class="prd-name" placeholder="Name it" maxlength="120">` : "") +
      `<span class="home-spacer"></span>` +
      `<span class="prd-target" title="The client and environment the cases will be written for">${ico("globe")}${h(targetWords())}</span>` +
      `<button type="button" class="prd-start" id="prd-go"${ready ? "" : " disabled"}>Write test cases <span class="home-start-arr">→</span></button>` +
      `</div></section>`
    );
  }

  function progress() {
    const s = Math.round((Date.now() - (S.busy?.since ?? Date.now())) / 1000);
    const stage = s < 25 ? 0 : s < 60 ? 1 : 2;
    const steps = ["Reading the rules", "Planning the scenarios", "Writing each scenario's cases"];
    return (
      `<section class="prd-ask prd-progress" role="status">` +
      `<div class="prd-prog-head"><span class="prd-spin" aria-hidden="true"></span><b>${h(S.busy?.what ?? "Working")}</b><span class="prd-count">${s}s</span></div>` +
      `<ol class="prd-prog-steps">${steps.map((t, i) => `<li class="${i < stage ? "done" : i === stage ? "now" : ""}"><span class="hs-n">${i < stage ? "✓" : `0${i + 1}`}</span>${t}</li>`).join("")}</ol>` +
      `<p class="prd-hint">Usually one to three minutes. Nothing runs until you say so.</p>` +
      `</section>`
    );
  }

  function recent() {
    if (!S.list.length) return "";
    return (
      `<section><div class="home-sec-head"><span class="mono-label">Recent PRDs</span></div><div class="home-rows">` +
      S.list
        .map((p) => {
          const tag = p.ran ? `<span class="tag-v tag-ok">${p.ran} run</span>` : `<span class="tag-v tag-grey">Not run yet</span>`;
          return `<button type="button" class="hr-row prd-recent" data-open="${h(p.id)}"><span class="hr-main"><span class="hr-title">${h(p.name)}</span><span class="hr-meta">${ico("globe")}<span>${h([p.module, p.company].filter(Boolean).join(" · "))} · ${h(when(p.updatedAt))}</span></span></span><span class="tag-v tag-grey">${plural(p.cases, "case")}</span><span class="tag-v tag-grey">${p.rules} rules</span>${tag}</button>`;
        })
        .join("") +
      `</div></section>`
    );
  }

  // ── a PRD open: tiles, cases, the run bar ────────────────────────────────
  function opened() {
    const d = S.cur;
    const cases = d.cases;
    const cov = d.coverage || [];
    const covered = cov.filter((x) => x.cases.length).length;
    const pct = cov.length ? Math.round((covered / cov.length) * 100) : 0;
    const kinds = Object.keys(KIND).map((k) => [k, cases.filter((c) => c.type === k).length]).filter(([, n]) => n);
    const tally = { pass: 0, fail: 0, warn: 0, todo: 0 };
    for (const c of cases) tally[state(c)]++;
    const ran = tally.pass + tally.fail + tally.warn;
    const words = (S.q || "").toLowerCase().split(/\s+/).filter(Boolean);
    const shown = cases
      .map((c, i) => i)
      .filter((i) => S.filter === "all" || cases[i].type === S.filter)
      .filter((i) => !words.length || words.every((w) => `${cases[i].id} ${cases[i].scenario} ${cases[i].expected} ${(cases[i].steps || []).join(" ")} ${cases[i].sourceStep}`.toLowerCase().includes(w)));
    const groups = [];
    for (const i of shown) {
      const c = cases[i];
      let g = groups.find((x) => x.id === (c.scenarioId || ""));
      if (!g) groups.push((g = { id: c.scenarioId || "", title: c.scenarioTitle || "", idx: [] }));
      g.idx.push(i);
    }
    const n = S.sel.size;
    const sug = cases.filter(isSug).length;
    const happy = cases.filter((c) => c.type === "Positive" && isSug(c)).length;
    const tile = (key, label, value, extra = "", tone = "") =>
      `<button type="button" class="prd-tile${tone ? ` t-${tone}` : ""}${S.filter === key ? " on" : ""}" data-f="${key}" aria-pressed="${S.filter === key}"><span class="prd-tile-l">${label}</span><span class="prd-tile-v">${value}</span>${extra}</button>`;

    return (
      `<div class="prd-col wide">` +
      `<header class="prd-top">` +
      `<button type="button" class="prd-ghost" data-act="home">${ico("arrow-left")}Another PRD</button>` +
      `<div class="prd-top-main"><h2>${h(d.prd.name)}</h2><span class="hr-meta">${ico("globe")}<span>${h([d.prd.module, d.prd.company, d.prd.fileName].filter(Boolean).join(" · "))} · read ${h(when(d.prd.createdAt))}</span></span></div>` +
      `<span class="home-spacer"></span>` +
      `<button type="button" class="prd-ghost" data-act="again" title="Write the cases again — cases you have run keep their result">${ico("rotate-cw")}Write again</button>` +
      `<button type="button" class="prd-ghost" data-act="forget">Forget</button>` +
      `</header>` +
      (d.prd.summary ? `<p class="prd-summary">${h(d.prd.summary)}</p>` : "") +
      (S.err ? `<p class="prd-msg bad">${h(S.err)}</p>` : "") +
      `<section class="prd-tiles" aria-label="What was written" style="--n:${kinds.length}">` +
      tile("all", "Test cases", cases.length, ran ? `<span class="prd-tile-s">${tally.pass ? `<i class="ok">${tally.pass} passed</i>` : ""}${tally.fail ? `<i class="bad">${tally.fail} failed</i>` : ""}${tally.todo ? `<i>${tally.todo} to run</i>` : ""}</span>` : `<span class="prd-tile-s">none run yet</span>`) +
      `<div class="prd-tile prd-tile-cov"><span class="prd-tile-l">Rules covered</span><span class="prd-tile-v">${covered}<small>/${cov.length}</small></span><span class="prd-cov-bar"><i style="width:${pct}%"></i></span><button type="button" class="prd-link" data-act="rules" aria-expanded="${S.rulesOpen}">${S.rulesOpen ? "Hide the coverage map" : "Coverage map"}</button></div>` +
      kinds.map(([k, c]) => tile(k, KIND[k][0], c, "", KIND[k][1])).join("") +
      `</section>` +
      ((d.prd.openQuestions || []).length || (d.prd.known || []).length
        ? `<section class="prd-oq"><button type="button" class="prd-link" data-act="oq" aria-expanded="${S.oqOpen}">${ico("info")}${(d.prd.openQuestions || []).length ? `${plural((d.prd.openQuestions || []).length, "open question")}` : ""}${(d.prd.openQuestions || []).length && (d.prd.known || []).length ? " · " : ""}${(d.prd.known || []).length ? `${plural((d.prd.known || []).length, "known item")}` : ""} — not turned into cases${S.oqOpen ? " (hide)" : ""}</button>` +
          (S.oqOpen
            ? `${(d.prd.openQuestions || []).length ? `<h4>Open questions / untestable</h4><ul>${(d.prd.openQuestions || []).map((q) => `<li>${h(q)}</li>`).join("")}</ul>` : ""}${(d.prd.known || []).length ? `<h4>Known behaviour the PRD flags</h4><ul>${(d.prd.known || []).map((q) => `<li>${h(q)}</li>`).join("")}</ul>` : ""}`
            : "") +
          `</section>`
        : "") +
      (S.rulesOpen
        ? `<section class="prd-rules">${d.prd.features
            .map(
              (f) =>
                `<h4>${h(f.title)}</h4><ul>${f.rules
                  .map((r) => {
                    const c = cov.find((x) => x.rule.id === r.id);
                    const k = c?.cases.length || 0;
                    return `<li class="${k ? (c.negative ? "ok" : "part") : "gap"}"><code>${h(r.id)}</code>${h(r.text)}<span title="${k ? h(c.cases.join(", ")) : ""}">${k ? `${h(c.cases.slice(0, 4).join(", "))}${c.cases.length > 4 ? ` +${c.cases.length - 4}` : ""}${c.negative ? "" : " · no negative"}` : "no case"}</span></li>`;
                  })
                  .join("")}</ul>`,
            )
            .join("")}</section>`
        : "") +
      (d.prd.note ? `<p class="prd-msg">${h(d.prd.note)}</p>` : "") +
      `<section class="prd-card">` +
      `<div class="prd-toolbar">` +
      `<label class="prd-search">${search}<input type="search" id="prd-q" placeholder="Search the cases" value="${h(S.q || "")}"></label>` +
      `<span class="prd-count">${n ? `${n} ticked` : `${shown.length} shown`}</span>` +
      `<button type="button" class="prd-link" data-act="tickall">Tick all</button><button type="button" class="prd-link" data-act="untick"${n ? "" : " disabled"}>Untick</button>` +
      `<span class="home-spacer"></span>` +
      `<button type="button" class="prd-link" data-x="xlsx">${ico("download")}Excel</button><button type="button" class="prd-link" data-x="csv">${ico("download")}CSV</button>` +
      `</div>` +
      `<ol class="prd-list">` +
      (groups.map((g) => `<li class="prd-group"><span class="prd-gid">${h(g.id)}</span><b>${h(g.title)}</b><span class="prd-count">${g.idx.length}</span></li>${g.idx.map((i) => row(cases[i], i)).join("")}`).join("") || `<li class="prd-empty">No case matches.</li>`) +
      `</ol></section>` +
      `<div class="prd-bar${S.step === "where" ? " where" : ""}">` +
      (S.step === "where"
        ? whereRow()
        : `<div class="prd-bar-row"><div class="prd-bar-ask"><b>Want to run them?</b><span>Each case runs as its own session, and every result waits for your approval.</span></div>` +
          `<button type="button" class="prd-btn" data-choose="happy"${happy ? "" : " disabled"}>${ico("play")}Positive <span class="prd-count">${happy}</span></button>` +
          `<button type="button" class="prd-btn" data-choose="all"${sug ? "" : " disabled"}>${ico("play")}All <span class="prd-count">${sug}</span></button>` +
          `<button type="button" class="prd-btn primary" data-choose="sel"${n ? "" : " disabled"}>${ico("play")}${n ? `Run ${n} ticked` : "Run ticked"}</button></div>`) +
      `</div>` +
      `</div>`
    );
  }

  function row(c, i) {
    const st = state(c);
    const opened = S.open.has(i);
    const rules = (c.sourceStep || "").match(/\bR\d+\b/g) || [];
    const [label, tone] = KIND[c.type] || [c.type, "none"];
    return (
      `<li class="prd-case${opened ? " open" : ""}${S.sel.has(i) ? " sel" : ""}">` +
      `<div class="prd-row"><input type="checkbox" class="prd-pick" data-sel="${i}"${S.sel.has(i) ? " checked" : ""} aria-label="Tick ${h(c.id)}">` +
      `<button type="button" class="prd-title" data-more="${i}" aria-expanded="${opened}"><span>${rich(c.scenario)}</span><small><code>${h(c.id)}</code> ${rich(c.expected)}</small></button>` +
      `<span class="tag-v t-${tone}">${h(label)}</span>` +
      `<span class="prd-st s-${st}" title="${h(st === "todo" ? "Not run yet" : c.status)}"><i></i>${h(st === "todo" ? "Not run" : c.status.replace(/ at step.*/i, ""))}</span></div>` +
      (c.qaComment && /^\[(BUG-CONFIRM|KNOWN BEHAVIOUR)\]/i.test(c.qaComment) && !opened ? `<p class="prd-qa-tag">${h(c.qaComment.slice(0, 140))}${c.qaComment.length > 140 ? "…" : ""}</p>` : "") +
      (opened
        ? `<div class="prd-body">` +
          (c.preconditions ? `<p><b>Before</b> ${h(c.preconditions)}</p>` : "") +
          (c.steps?.length ? `<ol>${c.steps.map((s) => `<li>${rich(s)}</li>`).join("")}</ol>` : "") +
          (c.testData ? `<p><b>Data</b> ${h(c.testData)}</p>` : "") +
          `<p><b>Expected</b> ${rich(c.expected)}</p>` +
          (c.why && st !== "todo" ? `<p><b>Actual</b> ${h(c.why)} — ${h(c.status)}</p>` : "") +
          (rules.length ? `<p><b>From the PRD</b> ${rules.map((r) => `<code>${h(r)}</code>`).join(" ")}</p>` : "") +
          (c.qaComment ? `<p class="prd-qa"><b>QA comment</b> ${h(c.qaComment)}</p>` : "") +
          `<p class="prd-body-acts">${c.runId ? `<a class="prd-link" href="#/session/${encodeURIComponent(c.runId)}">See the run</a>` : ""}<button type="button" class="prd-link" data-run-one="${i}">${ico("play")}Run just this one</button></p>` +
          `</div>`
        : "") +
      `</li>`
    );
  }

  function whereRow() {
    const curId = String(S.where?.clientId ?? document.getElementById("client")?.value ?? S.defaultClient ?? "");
    const env = S.where?.env ?? (document.getElementById("env")?.value === "custom" ? "custom" : "uat");
    const url = S.where?.url ?? document.getElementById("env-custom")?.value ?? "";
    const clients = S.clients.map((c) => `<option value="${h(c.id)}"${String(c.id) === curId ? " selected" : ""}>${h(c.name)}</option>`).join("");
    return (
      `<div class="prd-bar-row"><div class="prd-bar-ask"><b>${h(S.choice.label)} — where?</b><span>The run signs in there; the top bar follows.</span></div>` +
      `<label class="prd-field"><span>Client</span><select id="prd-client">${clients || `<option value="">Client</option>`}</select></label>` +
      `<label class="prd-field"><span>Environment</span><select id="prd-env"><option value="uat"${env === "uat" ? " selected" : ""}>UAT</option><option value="custom"${env === "custom" ? " selected" : ""}>Custom URL…</option></select></label>` +
      `<label class="prd-field prd-field-url" id="prd-url-field"${env === "custom" ? "" : " hidden"}><span>Base URL</span><input type="url" id="prd-url" placeholder="https://…" value="${h(url)}"></label>` +
      `<button type="button" class="prd-ghost" data-act="back">Back</button>` +
      `<button type="button" class="prd-btn primary" data-act="go">${ico("play")}Run ${plural(S.choice.idx.length, "case")}</button></div>`
    );
  }

  /** The top bar's client and environment follow what was answered here. */
  function setTarget(clientId, env, url) {
    const sel = document.getElementById("client");
    if (sel && clientId && sel.value !== String(clientId)) {
      sel.value = String(clientId);
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const envSel = document.getElementById("env");
    const box = document.getElementById("env-custom");
    if (!envSel) return;
    const want = env === "custom" && url ? "custom" : "uat";
    if (envSel.value !== want) {
      envSel.value = want;
      envSel.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (want === "custom" && box) {
      box.value = url;
      for (const ev of ["input", "change", "blur"]) box.dispatchEvent(new Event(ev, { bubbles: true }));
    }
  }

  function wire(el) {
    const file = el.querySelector("#prd-file");
    file?.addEventListener("change", () => {
      S.file = file.files?.[0] || null;
      paint();
    });
    const ask = el.querySelector("#prd-ask");
    ask?.addEventListener("dragover", (e) => {
      if (!e.dataTransfer?.types?.includes("Files")) return;
      e.preventDefault();
      ask.classList.add("over");
    });
    ask?.addEventListener("dragleave", () => ask.classList.remove("over"));
    ask?.addEventListener("drop", (e) => {
      const f = e.dataTransfer?.files?.[0];
      if (!f) return;
      e.preventDefault();
      S.file = f;
      S.pasting = false;
      paint();
    });
    el.querySelector("#prd-paste")?.addEventListener("click", () => {
      S.pasting = !S.pasting;
      if (S.pasting) S.file = null;
      paint();
      root().querySelector("[name=text]")?.focus();
    });
    el.querySelector("[name=text]")?.addEventListener("input", (e) => {
      S.typed = e.target.value;
      const go = root().querySelector("#prd-go");
      if (go) go.disabled = S.typed.trim().length < 200;
    });
    el.querySelector("[name=name]")?.addEventListener("input", (e) => (S.named = e.target.value));
    el.querySelector("#prd-go")?.addEventListener("click", () => write(S.file, S.typed || "", S.named || ""));
    el.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => openPrd(b.dataset.open)));
    if (!S.cur) return;
    const cases = S.cur.cases;
    const shownIdx = () => [...el.querySelectorAll("[data-sel]")].map((cb) => Number(cb.dataset.sel));
    el.querySelector('[data-act="home"]')?.addEventListener("click", () => {
      S.cur = null;
      S.step = "start";
      S.err = null;
      paint();
    });
    el.querySelectorAll(".prd-tiles [data-f]").forEach((b) => b.addEventListener("click", () => ((S.filter = S.filter === b.dataset.f && b.dataset.f !== "all" ? "all" : b.dataset.f), paint())));
    el.querySelector("#prd-q")?.addEventListener("input", (e) => {
      S.q = e.target.value;
      clearTimeout(S.qT);
      S.qT = setTimeout(() => {
        const at = e.target.selectionStart;
        paint();
        const q = root().querySelector("#prd-q");
        q?.focus();
        try {
          q?.setSelectionRange(at, at);
        } catch {
          /* fine */
        }
      }, 250);
    });
    el.querySelector('[data-act="rules"]')?.addEventListener("click", () => ((S.rulesOpen = !S.rulesOpen), paint()));
    el.querySelector('[data-act="oq"]')?.addEventListener("click", () => ((S.oqOpen = !S.oqOpen), paint()));
    el.querySelector('[data-act="tickall"]')?.addEventListener("click", () => (shownIdx().forEach((i) => S.sel.add(i)), paint()));
    el.querySelector('[data-act="untick"]')?.addEventListener("click", () => (S.sel.clear(), paint()));
    el.querySelectorAll("[data-sel]").forEach((cb) =>
      cb.addEventListener("change", () => {
        const i = Number(cb.dataset.sel);
        cb.checked ? S.sel.add(i) : S.sel.delete(i);
        paint();
      }),
    );
    el.querySelectorAll("[data-more]").forEach((b) =>
      b.addEventListener("click", () => {
        const i = Number(b.dataset.more);
        S.open.has(i) ? S.open.delete(i) : S.open.add(i);
        paint();
      }),
    );
    el.querySelectorAll("[data-run-one]").forEach((b) =>
      b.addEventListener("click", () => {
        const i = Number(b.dataset.runOne);
        S.choice = { idx: [i], label: `Run ${cases[i].id}` };
        S.step = "where";
        paint();
      }),
    );
    el.querySelectorAll("[data-choose]").forEach((b) =>
      b.addEventListener("click", () => {
        const which = b.dataset.choose;
        const idx = which === "sel" ? [...S.sel].sort((a, b2) => a - b2) : cases.map((c, i) => ((which === "happy" ? c.type === "Positive" : true) && isSug(c) ? i : -1)).filter((i) => i >= 0);
        S.choice = { idx, label: which === "all" ? `Run all ${idx.length}` : which === "happy" ? `Run the positive cases (${idx.length})` : `Run the ${idx.length} ticked` };
        S.step = "where";
        paint();
      }),
    );
    el.querySelector("#prd-env")?.addEventListener("change", (e) => {
      S.where = { ...(S.where || {}), env: e.target.value };
      const f = el.querySelector("#prd-url-field");
      if (f) f.hidden = e.target.value !== "custom";
      if (e.target.value === "custom") el.querySelector("#prd-url")?.focus();
    });
    el.querySelector("#prd-client")?.addEventListener("change", (e) => (S.where = { ...(S.where || {}), clientId: e.target.value }));
    el.querySelector("#prd-url")?.addEventListener("input", (e) => (S.where = { ...(S.where || {}), url: e.target.value.trim() }));
    el.querySelector('[data-act="back"]')?.addEventListener("click", () => ((S.step = "cases"), paint()));
    el.querySelector('[data-act="go"]')?.addEventListener("click", () => {
      const clientId = el.querySelector("#prd-client")?.value;
      const env = el.querySelector("#prd-env")?.value;
      const url = (el.querySelector("#prd-url")?.value || "").trim().replace(/\/$/, "");
      if (env === "custom" && !/^https?:\/\//i.test(url)) return alert("Type the full URL, starting with https://");
      setTarget(clientId, env, url);
      run(S.choice.idx);
    });
    el.querySelectorAll("[data-x]").forEach((b) =>
      b.addEventListener("click", () => {
        const rc = window.spineRunCases;
        const rows = cases.filter((c) => c.keep !== false);
        const name = `spine-test-cases-prd-${S.cur.prd.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)}-${new Date().toISOString().slice(0, 10)}`;
        // The tester's sheet, columns in exactly this order (Aanya, 12 Nov): TC ID | Module | Test Scenario | Test Case |
        // Preconditions | Test Steps | Test Data | Expected Result | Priority | Type | Actual Result | QA Comment — then a
        // Coverage map tab (PRD section / rule → case ids) and an Open questions tab.
        const COLS = [
          ["TC ID", (c) => c.id, 11, { center: true, bold: true }],
          ["Module", (c) => c.module || S.cur.prd.module, 16, { center: true }],
          ["Test Scenario", (c) => [c.scenarioId, c.scenarioTitle].filter(Boolean).join(" · "), 30, {}],
          ["Test Case", (c) => c.scenario, 44, { tint: true }],
          ["Preconditions", (c) => c.preconditions, 30, {}],
          ["Test Steps", (c) => (c.steps || []).map((s, i) => `${i + 1}. ${s}`).join("\n"), 52, {}],
          ["Test Data", (c) => c.testData, 26, {}],
          ["Expected Result", (c) => c.expected, 44, {}],
          ["Priority", (c) => c.priority, 9, { chips: { P0: "red", P1: "pink", P2: "yellow" }, list: ["P0", "P1", "P2"] }],
          ["Type", (c) => c.type, 13, { chips: { Positive: "mint", Negative: "pink", Boundary: "yellow", Edge: "yellow", Integration: "blue", Security: "pink", Performance: "yellow", Regression: "blue", "Bug-confirm": "pink", Observation: "grey" }, list: Object.keys(KIND) }],
          ["Actual Result", (c) => (/^(pass|fail|stopped|not tested)/i.test(c.status || "") ? `${c.status}${c.why ? ` — ${c.why}` : ""}` : ""), 30, {}],
          ["QA Comment", (c) => c.qaComment || "", 32, {}],
        ];
        const cov = S.cur.coverage || [];
        const mapRows = cov.map((x) => ({ section: x.rule.feature, rule: `${x.rule.id} · ${x.rule.text}`, kind: x.rule.kind, cases: x.cases.join(", "), state: x.cases.length ? (x.negative ? "Covered (with a negative/boundary)" : "Covered (positive only)") : "NOT COVERED" }));
        const MAP = [["PRD section", (r) => r.section, 28, {}], ["Requirement", (r) => r.rule, 70, {}], ["Kind", (r) => r.kind, 10, { center: true }], ["Case IDs", (r) => r.cases, 28, {}], ["Coverage", (r) => r.state, 26, { chips: { "NOT COVERED": "red", "Covered (positive only)": "yellow", "Covered (with a negative/boundary)": "mint" }, list: [] }]];
        const oqRows = [...(S.cur.prd.openQuestions || []).map((q) => ({ kind: "Open question / untestable", text: q })), ...(S.cur.prd.known || []).map((q) => ({ kind: "Known behaviour", text: q }))];
        const OQ = [["Kind", (r) => r.kind, 24, { center: true }], ["Item", (r) => r.text, 110, {}]];
        if (b.dataset.x === "xlsx" && window.spineBugExport?.xlsx) window.spineBugExport.xlsx(rows, { name, sheet: "Test cases", columns: COLS, summary: rc?.summary, title: `Test cases · PRD ${S.cur.prd.name}`, extra: [{ name: "Coverage map", rows: mapRows, columns: MAP }, { name: "Open questions", rows: oqRows, columns: OQ }] });
        else {
          const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
          const text = [COLS.map(([k]) => cell(k)).join(","), ...rows.map((r) => COLS.map(([, get]) => cell(get(r))).join(","))].join("\r\n");
          const url = URL.createObjectURL(new Blob(["\ufeff" + text], { type: "text/csv;charset=utf-8" }));
          const a = Object.assign(document.createElement("a"), { href: url, download: `${name}.csv` });
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
        }
      }),
    );
    el.querySelector('[data-act="again"]')?.addEventListener("click", again);
    el.querySelector('[data-act="forget"]')?.addEventListener("click", forget);
  }

  // ── on arrival ────────────────────────────────────────────────────────────
  let shownOnce = false;
  async function arrive() {
    if (!/^#\/?prd\b/.test(location.hash)) return;
    if (!shownOnce) {
      shownOnce = true;
      await Promise.all([loadList(), loadClients()]);
    } else await loadList();
    // Results arrive while the cases run in the session screen: reread the open PRD on return.
    if (S.cur) await openPrd(S.cur.prd.id);
    else paint();
  }
  window.addEventListener("hashchange", arrive);
  document.addEventListener("DOMContentLoaded", arrive);
  if (document.readyState !== "loading") arrive();
})();
