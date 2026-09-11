// ─────────────────────────────────────────────────────────────────────────
// The workflow view.
//
// One path: say what to test → see the plan → watch it run → read the verdict.
// The old screen offered a dozen ways to start a run, which meant choosing
// between them was the first thing anyone had to do. Here there is one input
// and one button, and the steps a test needs (publishing, filling the sheet,
// inviting a vendor) are inferred rather than picked from a list — because
// "create and publish an event" obviously includes publishing it.
// ─────────────────────────────────────────────────────────────────────────
const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

let client = null;
let stream = null;
let lastPlan = null;

const EXAMPLES = [
  "Create an RFQ with 3 line items and publish it",
  "Create a technical RFP event with 2 line items, publish it",
  "Two-stage technical + RFQ event with 2 line items",
  "Create an RFQ, invite AMD, publish, then have AMD bid from the vendor portal",
  "Create an RFQ, publish, place a surrogate bid for AMD and award them",
  "Negative: publish an RFQ without a template and confirm it is refused",
  "FE-2.4",
];

// ── stage machine ─────────────────────────────────────────────────────────
const STAGES = ["ask", "plan", "run", "verdict", "report"];
function stage(name) {
  const at = STAGES.indexOf(name);
  document.querySelectorAll("#stepper li").forEach((li) => {
    const i = STAGES.indexOf(li.dataset.stage);
    li.classList.toggle("on", i === at);
    li.classList.toggle("done", i < at);
  });
  for (const s of STAGES) {
    const card = $(`#card-${s}`);
    if (card) card.hidden = STAGES.indexOf(s) > at;
  }
  $(`#card-${name}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── boot ──────────────────────────────────────────────────────────────────
init();
async function init() {
  const { clients, defaultClient, provider } = await (await fetch("/api/clients")).json();
  $("#provider").textContent = provider;
  $("#provider").title = provider;
  const sel = $("#client");
  for (const c of clients) {
    const o = el("option");
    o.value = String(c.companyId);
    o.textContent = c.name ?? c.companyId;
    sel.appendChild(o);
  }
  client = defaultClient?.companyId ?? clients[0]?.companyId;
  sel.value = String(client);
  sel.addEventListener("change", () => (client = Number(sel.value)));

  const chips = $("#examples");
  for (const ex of EXAMPLES) {
    const chip = el("button", "wf-chip", esc(ex));
    chip.addEventListener("click", () => {
      $("#ask").value = ex;
      $("#ask").focus();
    });
    chips.appendChild(chip);
  }

  $("#go").addEventListener("click", () => start(false));
  $("#plan-only").addEventListener("click", () => start(true));
  $("#run-plan").addEventListener("click", () => start(false));
  $("#back-ask").addEventListener("click", () => stage("ask"));
  $("#again").addEventListener("click", () => {
    $("#ask").select?.();
    stage("ask");
  });
  $("#kb-go").addEventListener("click", () => loadMemory($("#kb-q").value.trim() || undefined));
  $("#kb-q").addEventListener("keydown", (e) => {
    if (e.key === "Enter") loadMemory($("#kb-q").value.trim() || undefined);
  });

  loadDefects();
  loadStuck();
  loadMemory();
}

// ── the run ───────────────────────────────────────────────────────────────
function start(planOnly) {
  const q = $("#ask").value.trim();
  if (!q) return $("#ask").focus();
  if (stream) stream.close();

  $("#go").disabled = true;
  $("#plan-only").disabled = true;
  $("#plan-steps").innerHTML = "";
  $("#run-steps").innerHTML = "";
  $("#verdict").innerHTML = "";
  $("#console").innerHTML = "";
  $("#plan-repairs").hidden = true;
  $("#plan-actions").hidden = true;
  stage("plan");

  const write = (text, cls) => {
    $("#console").appendChild(el("div", cls, esc(text)));
    $("#console").scrollTop = $("#console").scrollHeight;
  };

  const qs = new URLSearchParams({ c: String(client), q });
  if (planOnly) qs.set("dry", "1");
  if (!$("#headed").checked) qs.set("headed", "0");
  stream = new EventSource(`/api/plan-run?${qs}`);

  stream.addEventListener("stage", (e) => write("› " + JSON.parse(e.data).line, "cmd"));

  stream.addEventListener("plan", (e) => {
    const p = JSON.parse(e.data);
    lastPlan = p;
    $("#plan-source").textContent = `${p.steps.length} steps · ${p.source === "llm" ? "compiled by the AI" : "default plan"} · grounded in ${p.context.expectations} rule(s) and ${p.context.experience} past finding(s)`;
    $("#plan-why").textContent = p.reasoning || "";
    renderSteps($("#plan-steps"), p.steps);
    if (p.warnings?.length) {
      const box = $("#plan-repairs");
      box.innerHTML = "<b>Adjusted before running:</b>";
      for (const w of p.warnings) box.appendChild(el("div", null, "· " + esc(w)));
      box.hidden = false;
    }
    if (planOnly) {
      $("#plan-actions").hidden = false;
      done();
    } else {
      renderSteps($("#run-steps"), p.steps);
      $("#run-count").textContent = `0 / ${p.steps.length}`;
      stage("run");
    }
  });

  // Live progress: the executor narrates each step as "[plan] 4/16 name ✓ detail".
  stream.addEventListener("log", (e) => {
    const line = JSON.parse(e.data).line;
    write(line);
    const m = line.match(/\[plan\]\s+(\d+)\/(\d+)\s+(\S+)\s+([✓✗–])\s*(.*)$/);
    if (m) markStep(Number(m[1]), m[4], m[5]);
    else if (/^\[(create-event|award|surrogate|healed|learned|stuck)\]/.test(line)) write(line, "cmd");
  });

  stream.addEventListener("plan-result", (e) => {
    const r = JSON.parse(e.data);
    r.steps.forEach((s, i) => markStep(i + 1, s.status === "ok" ? "✓" : s.status === "failed" ? "✗" : "–", s.detail));
  });

  stream.addEventListener("verdicts", (e) => {
    const { verdicts } = JSON.parse(e.data);
    renderVerdict(verdicts);
    stage("verdict");
  });

  stream.addEventListener("done", (e) => {
    const code = JSON.parse(e.data).exitCode;
    if (!planOnly && !$("#verdict").innerHTML) renderVerdict([], code === 0);
    if (!planOnly) {
      renderReport(code === 0);
      stage("report");
    }
    done();
  });
  stream.addEventListener("error", (e) => {
    let msg = "the run could not start";
    try { msg = JSON.parse(e.data).line || msg; } catch {}
    write("✗ " + msg, "bad");
    done();
  });

  function done() {
    $("#go").disabled = false;
    $("#plan-only").disabled = false;
    stream?.close();
    stream = null;
    loadDefects();
    loadStuck();
  }
}

function renderSteps(box, steps) {
  box.innerHTML = "";
  steps.forEach((s, i) => {
    const li = el("li");
    li.dataset.n = String(i + 1);
    li.appendChild(el("span", "mark", "·"));
    li.appendChild(el("span", "n", String(i + 1)));
    const args = s.args && Object.keys(s.args).length
      ? ` <span class="args">${esc(Object.entries(s.args).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`).join(" · "))}</span>`
      : "";
    li.appendChild(el("span", "body", `<span class="what">${esc(humanStep(s.step))}</span>${args}`));
    box.appendChild(li);
  });
}

/** Step names read as actions, not identifiers. */
function humanStep(name) {
  const words = {
    open_create: "Open the create screen",
    compose_stages: "Set up the stages",
    switch_stage: "Move to a stage tab",
    set_title: "Name the event",
    select_template: "Choose a template",
    add_line_items: "Add the line items",
    fill_sheet: "Fill the pricing sheet",
    fill_questionnaires: "Fill the questionnaires",
    assign_evaluator: "Assign an evaluator",
    set_schedule: "Save the schedule",
    invite_vendor: "Invite the vendors",
    publish: "Publish the event",
    save_draft: "Save as a draft",
    place_bid: "Vendor bids from the portal",
    place_surrogate_bid: "Bid on the vendor's behalf",
    award_event: "Award the event",
    expect_line_items: "Check the line-item count",
    expect_published: "Check it published",
    expect_no_error: "Check no error appeared",
    expect_error: "Check the app refused it",
    expect_stages: "Check the stages",
    expect_bid_submitted: "Check the bid landed",
    expect_awarded: "Check the award went through",
    expect_publish_blocked: "Check publishing is blocked",
  };
  return words[name] ?? name.replace(/_/g, " ");
}

function markStep(n, mark, detail) {
  const box = $("#run-steps");
  const li = box.querySelector(`li[data-n="${n}"]`);
  if (!li) return;
  li.classList.remove("now");
  li.classList.toggle("ok", mark === "✓");
  li.classList.toggle("bad", mark === "✗");
  li.classList.toggle("skip", mark === "–");
  li.querySelector(".mark").textContent = mark === "✓" ? "✓" : mark === "✗" ? "✗" : "–";
  if (detail && !li.querySelector(".detail")) {
    li.appendChild(el("span", "detail", "— " + esc(String(detail).slice(0, 140))));
  }
  const next = box.querySelector(`li[data-n="${n + 1}"]`);
  if (next) next.classList.add("now");
  const total = box.querySelectorAll("li").length;
  $("#run-count").textContent = `${box.querySelectorAll("li.ok").length} / ${total}`;
}

const VERDICT_UI = {
  product_defect: { cls: "bug", icon: "🐞", title: "A product defect" },
  contradiction: { cls: "bug", icon: "🕳", title: "A silent failure" },
  product_rejected_input: { cls: "gap", icon: "🚧", title: "The product refused the input" },
  automation_defect: { cls: "harness", icon: "🔧", title: "The automation could not drive it" },
  environment: { cls: "harness", icon: "☁️", title: "The environment was unavailable" },
};

function renderVerdict(verdicts, passed) {
  const box = $("#verdict");
  box.innerHTML = "";
  if (!verdicts.length) {
    box.appendChild(
      el("div", `wf-verdict ${passed === false ? "" : "pass"}`,
        passed === false
          ? "<h3>The run did not finish, and nothing was recorded about why.</h3><p>The browser output below is the only evidence — worth a look before rerunning.</p>"
          : "<h3>✓ Everything held</h3><p>Every step completed and every check passed. No defects to report from this run.</p>"),
    );
    return;
  }
  for (const v of verdicts) {
    const ui = VERDICT_UI[v.kind] ?? VERDICT_UI.automation_defect;
    const card = el("div", `wf-verdict ${ui.cls}`);
    card.appendChild(el("h3", null, `${ui.icon} ${ui.title} — ${esc(v.severity)}`));
    card.appendChild(el("p", null, esc(v.title)));
    card.appendChild(el("p", null, esc(v.rationale)));
    for (const e of v.evidence ?? []) card.appendChild(el("code", null, esc(e)));
    if (v.seenBefore) card.appendChild(el("p", null, `Seen ${v.seenBefore}× before — this is a known issue, not a new one.`));
    box.appendChild(card);
  }
}

function renderReport(passed) {
  const box = $("#report-summary");
  box.innerHTML = "";
  const p = el("p", "wf-hint");
  p.textContent = passed
    ? "This test passed. The full report carries every defect found so far across all runs, grouped by defect rather than by journey."
    : "This test found something. The full report puts it in context: what should happen here, what has broken here before, and how to reproduce it.";
  box.appendChild(p);
}

// ── the collapsed context drawer ──────────────────────────────────────────
async function loadDefects() {
  try {
    const { groups, totals } = await (await fetch("/api/findings")).json();
    $("#c-defects").textContent = `${totals.defects} product · ${totals.gaps} gap · ${totals.harness} harness`;
    const box = $("#defects");
    box.innerHTML = "";
    if (!groups.length) return box.appendChild(el("div", "wf-empty", "Nothing found yet."));
    for (const g of groups) {
      const ui = VERDICT_UI[g.kind] ?? VERDICT_UI.automation_defect;
      const card = el("div", `wf-verdict ${ui.cls}`);
      card.style.marginBottom = "8px";
      card.appendChild(el("h3", null, `${ui.icon} ${esc(g.title)}`));
      card.appendChild(el("p", null, `${esc(g.severity)} · affects ${g.flows.length} journey(s) · seen ${g.occurrences}×`));
      for (const e of g.evidence.slice(0, 2)) card.appendChild(el("code", null, esc(e)));
      box.appendChild(card);
    }
  } catch { /* the drawer is not worth an error */ }
}

async function loadStuck() {
  try {
    const { stuck, learned } = await (await fetch("/api/stuck")).json();
    const taught = Object.keys(learned ?? {}).length;
    $("#c-stuck").textContent = `${stuck.length} stuck · ${taught} taught`;
    const box = $("#stuck");
    box.innerHTML = "";
    if (!stuck.length) {
      return box.appendChild(el("div", "wf-empty",
        taught ? `Nothing stuck. ${taught} locator(s) already taught.` : "Nothing stuck."));
    }
    for (const s of stuck) {
      const card = el("div", "wf-verdict harness");
      card.style.marginBottom = "8px";
      card.appendChild(el("h3", null, `🧭 ${esc(s.label)}`));
      card.appendChild(el("p", null, esc(String(s.message).split("\n")[0].slice(0, 200))));
      const btn = el("button", "wf-ghost", "Teach this locator");
      btn.addEventListener("click", () => teach(s.id, btn));
      card.appendChild(btn);
      box.appendChild(card);
    }
  } catch { /* ignore */ }
}

function teach(id, btn) {
  btn.disabled = true;
  btn.textContent = "teaching…";
  const qs = new URLSearchParams({ id });
  if (!$("#headed").checked) qs.set("headed", "0");
  const es = new EventSource(`/api/stuck/fix?${qs}`);
  es.addEventListener("log", (e) => {
    const l = JSON.parse(e.data).line;
    if (/\[teach\]|\[learned\]/.test(l)) {
      $("#console").appendChild(el("div", /LEARNED/.test(l) ? "ok" : null, esc(l)));
    }
  });
  const end = (text) => {
    btn.disabled = false;
    btn.textContent = text;
    es.close();
    loadStuck();
  };
  es.addEventListener("done", (e) => end(JSON.parse(e.data).exitCode === 0 ? "✓ taught" : "could not teach it here"));
  es.addEventListener("error", () => end("could not teach it here"));
}

async function loadMemory(query) {
  const box = $("#knowledge");
  try {
    const data = await (await fetch(query ? `/api/knowledge?q=${encodeURIComponent(query)}` : "/api/knowledge")).json();
    box.innerHTML = "";
    if (!data.built) return box.appendChild(el("div", "wf-empty", data.note ?? "Memory not built."));
    if (!query) {
      const k = data.byKind ?? {};
      const cases = (k["test-case"] ?? 0) + (k["api-contract"] ?? 0);
      $("#c-memory").textContent = `${cases} expectations · ${k.experience ?? 0} from experience`;
      return box.appendChild(el("div", "wf-hint",
        `${data.total} things indexed: ${cases} expectation cases, ${k.experience ?? 0} learned from past runs, ${k.doc ?? 0} documents.`));
    }
    const section = (title, rows) => {
      box.appendChild(el("div", "wf-hint", `<b>${esc(title)}</b>`));
      if (!rows.length) return box.appendChild(el("div", "wf-empty", "nothing relevant"));
      for (const r of rows) box.appendChild(el("code", null, esc(r.text.slice(0, 300))));
    };
    section("What should happen here", data.expectations ?? []);
    section("What has broken here before", data.experience ?? []);
  } catch (e) {
    box.innerHTML = "";
    box.appendChild(el("div", "wf-empty", `Could not load memory: ${esc(e.message)}`));
  }
}
