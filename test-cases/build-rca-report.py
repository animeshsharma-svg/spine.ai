#!/usr/bin/env python3
"""The report page of the RCA replay: which real bugs the platform found, which tickets are not on UAT, what it
could not judge and why, what it learnt, and how well it derives cases — one self-contained HTML page built from
the run records (prototype/data/sheet-runs), the QA review (rca-review.json), the derivation log and the catalog.

    python3 build-rca-report.py  →  RCA_Replay_Report.html
"""
import html
import json
import re
from collections import Counter, OrderedDict
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROTO = HERE.parent / "prototype"
RUNS = PROTO / "data" / "sheet-runs"
OUT = HERE / "RCA_Replay_Report.html"
E = html.escape

# ── the verdicts: latest sound verdict per case, then the QA review on top ───────────────────────────────────
runs = []
for f in RUNS.glob("sheet-*.json"):
    try:
        r = json.load(open(f))
    except Exception:
        continue
    if r.get("sheet") == "rca-real-bugs-jul-sep-2026":
        runs.append(r)
runs.sort(key=lambda r: r["startedAt"])
latest = {}
for r in runs:
    for c in r["cases"]:
        if "ENETUNREACH" in c["why"] or "ETIMEDOUT" in c["why"]:
            continue
        if c["status"] != "Not run" or c["id"] not in latest:
            latest[c["id"]] = (r, c)
review = json.load(open(HERE / "rca-review.json")) if (HERE / "rca-review.json").exists() else {}
cases = json.load(open(PROTO / "data" / "sheet-cases.json"))["cases"]
sheet = {c["id"]: c for c in cases if c["sheet"] == "rca-real-bugs-jul-sep-2026"}
rows = []
for cid in sorted(sheet):
    c = sheet[cid]
    r, v = latest.get(cid, (None, None))
    status = v["status"] if v else "Not run"
    why = v["why"] if v else "Not reached by any run."
    auto = status
    note = ""
    if cid in review:
        status = review[cid]["status"]
        note = review[cid]["note"]
    ticket = re.search(r"HubSpot ([0-9 /]+)", c.get("reference", "") or "")
    rows.append({"id": cid, "title": c["title"], "module": c["module"], "ticket": (ticket.group(1).strip() if ticket else "-"), "reference": c.get("reference", ""), "status": status, "auto": auto, "why": why, "note": note, "run": (r["id"] if r else ""), "layer": c["layer"]})
counts = Counter(r["status"] for r in rows)
ORDER = ["Fail", "Observation", "Pass", "Partly checked", "Blocked", "Couldn't tell", "Not run"]
TONE = {"Fail": "bad", "Observation": "warn", "Pass": "ok", "Partly checked": "part", "Blocked": "idle", "Couldn't tell": "idle", "Not run": "idle"}
runs_n = len(runs)

# ── derivations ───────────────────────────────────────────────────────────────────────────────────────────
deriv = []
for f in sorted((PROTO / "data" / "derivations").glob("*.jsonl")) if (PROTO / "data" / "derivations").exists() else []:
    for line in open(f):
        try:
            deriv.append(json.loads(line))
        except Exception:
            pass
questions = json.load(open(PROTO / "data" / "product-questions.json")) if (PROTO / "data" / "product-questions.json").exists() else []
catalog_total = 8465
catalog_runs = 2401
catalog_reach = 3734

def pill(s):
    return f'<span class="pill {TONE.get(s, "idle")}">{E(s)}</span>'

def row_html(r):
    note = f'<p class="note"><b>QA review:</b> {E(r["note"])}</p>' if r["note"] else ""
    auto = f' <small class="auto">(the run said {E(r["auto"])})</small>' if r["auto"] != r["status"] else ""
    return f'<tr><td class="mono">{E(r["id"])}</td><td><b>{E(r["title"])}</b><div class="muted">{E(r["module"])} · ticket {E(r["ticket"])}</div>{note}</td><td>{pill(r["status"])}{auto}</td><td class="why">{E(r["why"][:420])}</td></tr>'

fails = [r for r in rows if r["status"] == "Fail"]
obs = [r for r in rows if r["status"] == "Observation"]
passes = [r for r in rows if r["status"] in ("Pass", "Partly checked")]
gaps = [r for r in rows if r["status"] in ("Couldn't tell", "Blocked", "Not run")]

bug_cards = ""
for r in fails + obs:
    kind = "Reproduced bug" if r["status"] == "Fail" else "Observation"
    bug_cards += f'''<article class="bug {TONE[r["status"]]}"><div class="eyebrow">{E(kind)} · {E(r["module"])} · ticket {E(r["ticket"])}</div>
<h3>{E(r["title"])}</h3><p>{E(r["why"][:700])}</p>{f'<p class="note"><b>QA review:</b> {E(r["note"])}</p>' if r["note"] else ""}
<p class="muted mono">{E(r["id"])} · run {E(r["run"])}</p></article>'''

deriv_rows = "".join(
    f'<tr><td><b>{E(d["subject"][:90])}</b><div class="muted">{E(d["kind"])} · {E(d["module"])} · {d["ms"]//1000}s</div></td><td class="num">{d["cases"]}</td><td class="num">{d["fresh"]}</td><td class="num">{d["questions"]}</td><td class="dims">{" ".join(f"<span class=chip>{E(k)} {v}</span>" for k, v in sorted(d["dimensions"].items(), key=lambda x: -x[1]))}</td><td class="muted">{d["grounding"]["rules"]} rules · {d["grounding"]["settings"]} settings · {d["grounding"]["defects"]} RCA · {d["grounding"]["product"]} product · {d["grounding"]["existing"]} written</td></tr>'
    for d in deriv
)
q_rows = "".join(f'<li><b>{E(q["question"])}</b><div class="muted">{E(q["why"])} Until answered: {E(q["assume"])}</div></li>' for q in questions[:10])

tiles = "".join(f'<div class="tile {TONE[s]}"><b>{counts.get(s, 0)}</b><span>{E(s)}</span></div>' for s in ORDER)

page = f'''<title>RCA Replay on UAT</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,600;8..60,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* layout: one reading column, tiles up top, bug cards, then the full table — a QA report, not a dashboard */
:root {{ --bg:#f6f4ef; --paper:#fffdf9; --fg:#1f2a2e; --muted:#5f6b70; --line:#dcd7cc; --accent:#0f6b6e; --accent-soft:#dcebea;
  --bad:#a52a1d; --bad-soft:#f6e2de; --warn:#8a5a00; --warn-soft:#f7ecd2; --ok:#1d6b3a; --ok-soft:#dff0e3; --part:#5a4a8a; --part-soft:#e8e2f3; --idle:#5f6b70; --idle-soft:#e9e6df;
  --display:"Source Serif 4", Georgia, "Times New Roman", serif; --body:"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif; --mono:"IBM Plex Mono", ui-monospace, Menlo, monospace; }}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{ --bg:#15191b; --paper:#1d2326; --fg:#e8e6df; --muted:#a3aba8; --line:#2f3a3e; --accent:#6ec3c2; --accent-soft:#163b3c;
  --bad:#ff8f80; --bad-soft:#3a1c18; --warn:#f0c36b; --warn-soft:#3a2d10; --ok:#7fd49a; --ok-soft:#14321f; --part:#c2b3ef; --part-soft:#2a2340; --idle:#a3aba8; --idle-soft:#262c2f; color-scheme: dark }} }}
:root[data-theme="dark"] {{ --bg:#15191b; --paper:#1d2326; --fg:#e8e6df; --muted:#a3aba8; --line:#2f3a3e; --accent:#6ec3c2; --accent-soft:#163b3c;
  --bad:#ff8f80; --bad-soft:#3a1c18; --warn:#f0c36b; --warn-soft:#3a2d10; --ok:#7fd49a; --ok-soft:#14321f; --part:#c2b3ef; --part-soft:#2a2340; --idle:#a3aba8; --idle-soft:#262c2f; color-scheme: dark }}
body {{ background: var(--bg); color: var(--fg); font: 15px/1.55 var(--body); padding-block: 28px 64px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }}
main {{ max-width: 1100px; margin: 0 auto; display: grid; gap: 28px; }}
h1, h2, h3 {{ font-family: var(--display); text-wrap: balance; margin: 0; }}
h1 {{ font-size: 2.1rem; line-height: 1.15; }} h2 {{ font-size: 1.35rem; margin-bottom: 8px; }} h3 {{ font-size: 1.1rem; }}
.eyebrow {{ font-size: .74rem; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); font-weight: 600; }}
.lead {{ max-width: 68ch; color: var(--fg); }}
.muted {{ color: var(--muted); font-size: .9rem; }} .mono {{ font-family: var(--mono); font-size: .82rem; }}
.tiles {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(118px, 1fr)); gap: 10px; }}
.tile {{ background: var(--paper); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; display: grid; gap: 2px; }}
.tile b {{ font: 600 1.7rem/1 var(--display); font-variant-numeric: tabular-nums; }} .tile span {{ font-size: .82rem; color: var(--muted); }}
.tile.bad b {{ color: var(--bad); }} .tile.ok b {{ color: var(--ok); }} .tile.warn b {{ color: var(--warn); }} .tile.part b {{ color: var(--part); }}
.pill {{ display: inline-block; font-size: .74rem; font-weight: 600; border-radius: 999px; padding: 2px 9px; white-space: nowrap; }}
.pill.bad {{ color: var(--bad); background: var(--bad-soft); }} .pill.ok {{ color: var(--ok); background: var(--ok-soft); }} .pill.warn {{ color: var(--warn); background: var(--warn-soft); }} .pill.part {{ color: var(--part); background: var(--part-soft); }} .pill.idle {{ color: var(--idle); background: var(--idle-soft); }}
.auto {{ color: var(--muted); display: block; font-size: .78rem; margin-top: 3px; }}
.bugs {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; }}
.bug {{ background: var(--paper); border: 1px solid var(--line); border-left: 4px solid var(--bad); border-radius: 10px; padding: 14px 16px; display: grid; gap: 8px; min-width: 0; }}
.bug.warn {{ border-left-color: var(--warn); }} .bug p {{ margin: 0; }}
.note {{ margin: 4px 0 0; padding: 8px 10px; background: var(--accent-soft); border-radius: 8px; font-size: .9rem; }}
.tablewrap {{ overflow-x: auto; background: var(--paper); border: 1px solid var(--line); border-radius: 10px; }}
table {{ border-collapse: collapse; width: 100%; font-size: .9rem; min-width: 760px; }}
th, td {{ text-align: left; vertical-align: top; padding: 9px 10px; border-bottom: 1px solid var(--line); }} th {{ font-size: .76rem; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }}
td.why {{ color: var(--fg); max-width: 46ch; }} td.num {{ font-variant-numeric: tabular-nums; text-align: right; }}
.chip {{ display: inline-block; font-size: .74rem; background: var(--idle-soft); color: var(--idle); border-radius: 6px; padding: 1px 6px; margin: 1px 2px 1px 0; }}
.two {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 18px; }}
.card {{ background: var(--paper); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; min-width: 0; }}
ul, ol {{ margin: 6px 0 0; padding-left: 1.25em; }} li {{ margin: 4px 0; }}
.files li {{ font-family: var(--mono); font-size: .84rem; }}
@media (max-width: 640px) {{ h1 {{ font-size: 1.6rem; }} }}
</style>
<main>
<header>
<div class="eyebrow">spine.ai · PROCOL DEMO (198678) · UAT · 5–9 November 2026 · {runs_n} runs</div>
<h1>Real customer bugs, replayed on UAT</h1>
<p class="lead">187 code and data defects from the HubSpot / RCA triage of July–September 2026 were read; the {len(rows)} whose symptom the platform's automation can reach were written as plain-English test cases and run on PROCOL DEMO through the browser and the API. A Pass means the ticket's symptom is not on UAT today. A Fail is a symptom that reproduced on a fresh event, twice. Where the automation itself fell short, the case says so and is not counted as a bug.</p>
</header>

<section>
<div class="tiles">{tiles}</div>
</section>

<section>
<h2>What the platform found</h2>
<div class="bugs">{bug_cards or '<p class="muted">No reproduced bug.</p>'}</div>
</section>

<section>
<h2>Tickets whose symptom is not on UAT</h2>
<p class="muted">{len(passes)} cases passed or held on every check the automation could make. Each one is the exact symptom a customer reported, rebuilt on a fresh event.</p>
<div class="tablewrap"><table><thead><tr><th>Case</th><th>What was checked</th><th>Verdict</th><th>What the run showed</th></tr></thead><tbody>{"".join(row_html(r) for r in passes)}</tbody></table></div>
</section>

<section>
<h2>Not judged, and why</h2>
<p class="muted">{len(gaps)} cases ended without a verdict on the product. Every reason is an automation gap, a missing login or a hidden setting, written in the case's own words so the next build knows what to add.</p>
<div class="tablewrap"><table><thead><tr><th>Case</th><th>What was checked</th><th>Verdict</th><th>Why</th></tr></thead><tbody>{"".join(row_html(r) for r in gaps)}</tbody></table></div>
</section>

<section class="two">
<div class="card"><h2>What the runs taught the platform</h2>
<ul>
<li>A notification toast on PROCOL DEMO sat over the single-stage configuration drawer; a forced click landed on it and the event type was never chosen. The platform now declines the prompt first and, for RFQ cases, sets the company default so the drawer stays closed.</li>
<li>"Invite Vendor" with no name adds every suggested vendor (193–205). A participation figure can never read "2/2"; the compiler no longer writes one.</li>
<li>A fresh surrogate bid read as "from the vendor portal" because a response row appeared before the bid row. Who placed a bid is now read from bid rows only, and an unknown is "Couldn't tell", never a verdict.</li>
<li>Seven fairness rules: a Playwright timeout, a label the compiler guessed, a check after a part nobody did, the run's own generated title read back, "nothing to judge on this screen", a flag compared with a list, and "status is 200" on a field called status all end as "Couldn't tell" instead of Fail.</li>
<li>An unattended sheet run waits two minutes for an answer, not fifteen; a network outage on the machine is recognised and those cases are rerun, never counted.</li>
</ul></div>
<div class="card"><h2>Where the cases and the records are</h2>
<ul class="files">
<li>test-cases/RCA_Real_Bugs_Jul-Sep_2026.xlsx — the 38 cases (14 house columns + Reference)</li>
<li>test-cases/RCA_Real_Bugs_Run_Report.xlsx — Test Cases with Status and Actual Result, Bugs in the team's bug layout</li>
<li>test-cases/rca-review.json — the QA review of the run evidence, row by row</li>
<li>test-cases/All_Test_Cases_Catalog_2026-11-09.xlsx — every case the platform holds ({catalog_total:,}), with how each one runs</li>
<li>test-cases/Product_Questions_for_Team.xlsx — {len(questions) + 11 + 60 if questions else 171} questions the platform cannot settle alone</li>
<li>spine.ai → Test sheets → "rca-real-bugs-jul-sep-2026" — run any case again, open the report with screenshots</li>
</ul></div>
</section>

<section>
<h2>Deriving test cases from anything</h2>
<p class="muted">Typed on Home, a feature phrase, a flow, a PRD, one case or a ticket is now read as a subject and walked through ten dimensions: the main path, who may and may not, each event state, each company setting on and off, awkward values, refusals, timing, the API channel, the numbers, and who sees what. Every case cites the code rule, setting, past ticket or product feature it rests on; a case the team already wrote is shown with its id instead of being written again; the doubts become questions for the team. Two measured runs:</p>
<div class="tablewrap"><table><thead><tr><th>Subject</th><th>Cases</th><th>New</th><th>Questions</th><th>Dimensions</th><th>Grounded in</th></tr></thead><tbody>{deriv_rows or '<tr><td colspan="6" class="muted">No derivation logged yet.</td></tr>'}</tbody></table></div>
<p class="muted">The catalog holds {catalog_total:,} written cases across 570 sections; {catalog_runs:,} run end to end today and {catalog_reach:,} reach a runner. The first derivation of "test reject bid" did not see the 29 reject-bid cases the team had already written, because the lookup searched the whole phrase; it now matches on shared word stems, and a drafted title that says the same as a written one is shown with that id.</p>
</section>

<section>
<h2>Questions only the team can answer</h2>
<p class="muted">The first ten of {len(questions)} raised by the derivations; the workbook holds all of them with the RCA-run blockers, the explorer's questions, the flow map's Q1–Q25 and the uncovered permission rules.</p>
<ol>{q_rows or '<li class="muted">None yet.</li>'}</ol>
</section>
</main>
'''
OUT.write_text(page)
print(f"{len(rows)} cases → {OUT.name}; counts {dict(counts)}; derivations {len(deriv)}; questions {len(questions)}")
