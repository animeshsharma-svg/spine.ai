#!/usr/bin/env python3
"""Merge the live run (api-results.json + ui-results.json) into the approval-routing cases:
Status per case from its automated checks, a Bug Sheet with screenshots, and a readable page.

Output: Approval_Routing_Test_Cases_and_Bugs.xlsx + approval-routing/index.html"""
import base64
import html
import io
import json
import re
from collections import Counter, OrderedDict
from pathlib import Path

import openpyxl
from openpyxl.drawing.image import Image as XLImage
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from PIL import Image

HERE = Path(__file__).resolve().parent
EV = HERE.parent / "prototype" / "data" / "evidence" / "approval-routing"
D = json.loads((HERE / "approval-routing" / "data.json").read_text())
cases, rules, found, modules = D["cases"], D["rules"], D["found"], D["modules"]
checks = {}
for f in ("api-results.json", "ui-results.json"):
    p = EV / f
    if p.exists():
        for r in json.loads(p.read_text()).get("rows", []):
            checks[r["id"]] = r


def expand(ref):
    """'API-SAVE-003…006, 014' → the ids it names (ranges by the trailing number)."""
    ids = []
    for part in [x.strip() for x in ref.split(",") if x.strip()]:
        m = re.match(r"^([A-Z]+-[A-Z]+-)(\d+)(?:…(\d+))?$", part)
        if m:
            a, b = int(m.group(2)), int(m.group(3) or m.group(2))
            ids += [f"{m.group(1)}{i:03d}" for i in range(a, b + 1)]
        elif re.match(r"^\d+$", part) and ids:
            ids.append(ids[-1].rsplit("-", 1)[0] + f"-{int(part):03d}")
        else:
            ids.append(part)
    return ids


ORDER = {"Fail": 0, "Couldn't tell": 1, "Record": 2, "Not run": 3, "Pass": 4}
for c in cases:
    refs = [i for i in expand(c["Automated check"]) if i in checks]
    c["_checks"] = [checks[i] for i in refs]
    if not refs:
        c["Status"] = "Not Run"
        continue
    worst = min(c["_checks"], key=lambda r: ORDER.get(r["verdict"], 5))["verdict"]
    c["Status"] = {"Fail": "Fail", "Pass": "Pass", "Record": "Record", "Couldn't tell": "Couldn't tell", "Not run": "Not Run"}[worst]
    c["Observed"] = "\n".join(f"{r['id']}: {r['verdict']} — {r['observed'][:400]}" for r in c["_checks"])

# ── bug sheet: one row per Fail/Record check that carries a bug or a notable observation ─────
BUGS = []
seen = set()
for sev, what, why, ev, ids in found:
    BUGS.append({"id": f"ARB-{len(BUGS) + 1:02d}", "sev": sev, "what": what, "why": why, "evidence": ev, "cases": ids,
                 "shots": []})
# attach screenshots from the checks named in each finding
for b in BUGS:
    for part in re.split(r"[,/]", b["cases"]):
        part = part.strip()
        for cid in expand(part) if part.startswith(("API-", "UI-")) else []:
            r = checks.get(cid)
            if r:
                for s in r.get("shots") or []:
                    if s and Path(s).exists() and s not in b["shots"]:
                        b["shots"].append(s)
        # case ids → their checks' shots
        for c in cases:
            if c["Test Case ID"] == part:
                for r in c["_checks"]:
                    for s in r.get("shots") or []:
                        if s and Path(s).exists() and s not in b["shots"]:
                            b["shots"].append(s)


def thumb(path, width=560):
    im = Image.open(path).convert("RGB")
    im.thumbnail((width, 10_000))
    buf = io.BytesIO(); im.save(buf, "JPEG", quality=72)
    return buf.getvalue(), im.size


# ── workbook ──────────────────────────────────────────────────────────────────────────────────
COLS = ["Test Case ID", "Module", "Scenario", "Test Case Title", "User Role", "Portal", "Pre-conditions", "Configs Needed",
        "Test Data", "Test Steps", "Expected Result", "Priority", "Test Type", "Status", "Automated check", "Observed (live run 3 Nov 2026)", "Notes for the tester"]
WIDTH = [13, 24, 18, 42, 16, 18, 40, 12, 18, 70, 64, 10, 10, 11, 20, 60, 28]
HEAD = PatternFill("solid", fgColor="1F3A5F")
STAT = {"Pass": "D5F5E3", "Fail": "FADBD8", "Record": "FDEBD0", "Couldn't tell": "FCF3CF", "Not Run": "EAEDED"}
PRI = {"Critical": "C0392B", "High": "D35400", "Medium": "B7950B", "Low": "5D6D7E", "Info": "5D6D7E"}
thin = Side(style="thin", color="C9D3DF"); BOX = Border(left=thin, right=thin, top=thin, bottom=thin)

wb = openpyxl.Workbook()
ws = wb.active; ws.title = "Test Cases"
ws.append(COLS)
for i, w in enumerate(WIDTH, 1):
    c = ws.cell(row=1, column=i); c.font = Font(bold=True, color="FFFFFF"); c.fill = HEAD; c.alignment = Alignment(wrap_text=True, vertical="center")
    ws.column_dimensions[get_column_letter(i)].width = w
for c in cases:
    ws.append([c.get(k, c.get("Observed", "")) if k != "Observed (live run 3 Nov 2026)" else c.get("Observed", "") for k in COLS])
    r = ws.max_row
    for i in range(1, len(COLS) + 1):
        cell = ws.cell(row=r, column=i); cell.alignment = Alignment(wrap_text=True, vertical="top"); cell.border = BOX
    ws.cell(row=r, column=COLS.index("Priority") + 1).font = Font(bold=True, color=PRI[c["Priority"]])
    ws.cell(row=r, column=COLS.index("Status") + 1).fill = PatternFill("solid", fgColor=STAT.get(c["Status"], "FFFFFF"))
ws.freeze_panes = "E2"; ws.auto_filter.ref = f"A1:{get_column_letter(len(COLS))}{ws.max_row}"

bs = wb.create_sheet("Bug Sheet")
bs.append(["Bug ID", "Severity", "What is wrong", "Why / impact", "Evidence", "Test cases", "Screenshot"])
for i, w in enumerate([9, 10, 48, 56, 48, 26, 80], 1):
    c = bs.cell(row=1, column=i); c.font = Font(bold=True, color="FFFFFF"); c.fill = HEAD
    bs.column_dimensions[get_column_letter(i)].width = w
for b in BUGS:
    bs.append([b["id"], b["sev"], b["what"], b["why"], b["evidence"], b["cases"], ""])
    r = bs.max_row
    for i in range(1, 8):
        cell = bs.cell(row=r, column=i); cell.alignment = Alignment(wrap_text=True, vertical="top"); cell.border = BOX
    bs.cell(row=r, column=2).font = Font(bold=True, color=PRI[b["sev"]])
    if b["shots"]:
        data, (w, h) = thumb(b["shots"][0], 540)
        img = XLImage(io.BytesIO(data)); img.width, img.height = w, h
        bs.add_image(img, f"G{r}"); bs.row_dimensions[r].height = max(60, h * 0.78)

rs = wb.create_sheet("Run details")
rs.append(["Check ID", "Verdict", "Title", "Observed", "Screenshots"])
for i, w in enumerate([16, 12, 60, 90, 50], 1):
    c = rs.cell(row=1, column=i); c.font = Font(bold=True, color="FFFFFF"); c.fill = HEAD; rs.column_dimensions[get_column_letter(i)].width = w
for r in sorted(checks.values(), key=lambda x: x["id"]):
    rs.append([r["id"], r["verdict"], r["title"], r["observed"], ", ".join(Path(s).name for s in (r.get("shots") or []))])
    rr = rs.max_row
    for i in range(1, 6):
        rs.cell(row=rr, column=i).alignment = Alignment(wrap_text=True, vertical="top")
    rs.cell(row=rr, column=2).fill = PatternFill("solid", fgColor=STAT.get({"Not run": "Not Run"}.get(r["verdict"], r["verdict"]), "FFFFFF"))

sm = wb.create_sheet("Summary")
mods = OrderedDict()
for c in cases: mods.setdefault(c["Module"], []).append(c)
sm.append(["Module", "Cases", "Pass", "Fail", "Record", "Not Run", "Critical", "High"])
for m, cs in mods.items():
    sm.append([m, len(cs)] + [sum(1 for c in cs if c["Status"] == s) for s in ("Pass", "Fail", "Record", "Not Run")] + [sum(1 for c in cs if c["Priority"] == p) for p in ("Critical", "High")])
sm.append(["Total", len(cases)] + [sum(1 for c in cases if c["Status"] == s) for s in ("Pass", "Fail", "Record", "Not Run")] + [sum(1 for c in cases if c["Priority"] == p) for p in ("Critical", "High")])
for i in range(1, 9):
    sm.cell(row=1, column=i).font = Font(bold=True, color="FFFFFF"); sm.cell(row=1, column=i).fill = HEAD; sm.column_dimensions[get_column_letter(i)].width = 12 if i > 1 else 58
sm.cell(row=sm.max_row, column=1).font = Font(bold=True)

ru = wb.create_sheet("Rules behind the cases")
ru.append(["Topic", "Rule"]); [ru.append(list(t)) for t in rules]
ru.column_dimensions["A"].width = 26; ru.column_dimensions["B"].width = 120
for row in ru.iter_rows(min_row=2):
    for cell in row: cell.alignment = Alignment(wrap_text=True, vertical="top")
OUT_XLSX = HERE / "Approval_Routing_Test_Cases_and_Bugs.xlsx"
wb.save(OUT_XLSX)

# ── page ──────────────────────────────────────────────────────────────────────────────────────
e = html.escape
counts = Counter(c["Status"] for c in cases)


def img_tag(path, width=520):
    data, (w, h) = thumb(path, width)
    return f'<img loading="lazy" src="data:image/jpeg;base64,{base64.b64encode(data).decode()}" width="{w}" height="{h}" alt="">'


bugs_html = "".join(
    f'<li class="f f-{b["sev"].lower()}"><span class="sev">{e(b["sev"])}</span><div><b>{e(b["id"])} · {e(b["what"])}</b>'
    f'{"<p>" + e(b["why"]) + "</p>" if b["why"] else ""}<p class="ev">{e(b["evidence"])}</p><p class="ref">Cases: {e(b["cases"])}</p>'
    f'{"<div class=shots>" + "".join(img_tag(s) for s in b["shots"][:2]) + "</div>" if b["shots"] else ""}</div></li>' for b in BUGS)
rules_html = "".join(f"<dt>{e(t)}</dt><dd>{e(r)}</dd>" for t, r in rules)
flow_html = "".join(f'<button class="step" data-mod="{e(m)}"><span class="n">{e(m.split(".")[0])}</span><span class="t">{e(m.split(". ", 1)[1])}</span>'
                    f'<span class="c">{sum(1 for c in cases if c["Module"] == m and c["Status"] == "Pass")}/{sum(1 for c in cases if c["Module"] == m)}</span></button>' for m in modules)
slim = [{k: v for k, v in c.items() if not k.startswith("_")} | {"shots": [img_tag(s, 420) for r in c["_checks"] for s in (r.get("shots") or [])[:1] if s and Path(s).exists()][:2]} for c in cases]

PAGE = """<title>Approval Routing Test Run</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root{--bg:#f6f7f9;--card:#fff;--ink:#16202c;--soft:#566476;--line:#dfe4ea;--accent:#1d5fbf;--accent-bg:#e8f0fc;--amber:#9a5b00;--amber-bg:#fff4dc;
--crit:#b42318;--crit-bg:#fdecea;--high:#b54708;--high-bg:#fff1e6;--med:#7a6400;--med-bg:#fbf6d9;--low:#4b5868;--low-bg:#eef1f4;--ok:#1a7f4b;--ok-bg:#e3f6ea;--mono:"IBM Plex Mono",ui-monospace,Menlo,monospace}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0f141b;--card:#171e27;--ink:#e6ebf1;--soft:#9aa7b6;--line:#2a3441;--accent:#7fb0ff;--accent-bg:#1b2b44;--amber:#f2b552;--amber-bg:#33270f;--crit:#ff8a80;--crit-bg:#3a1714;--high:#ffb07a;--high-bg:#3a2414;--med:#e8d26a;--med-bg:#332d10;--low:#b4c0cd;--low-bg:#222b36;--ok:#6fd3a0;--ok-bg:#12301f;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#0f141b;--card:#171e27;--ink:#e6ebf1;--soft:#9aa7b6;--line:#2a3441;--accent:#7fb0ff;--accent-bg:#1b2b44;--amber:#f2b552;--amber-bg:#33270f;--crit:#ff8a80;--crit-bg:#3a1714;--high:#ffb07a;--high-bg:#3a2414;--med:#e8d26a;--med-bg:#332d10;--low:#b4c0cd;--low-bg:#222b36;--ok:#6fd3a0;--ok-bg:#12301f;color-scheme:dark}
*{box-sizing:border-box}body{background:var(--bg);color:var(--ink);font:15px/1.55 "IBM Plex Sans",system-ui,sans-serif;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:28px 64px}
.wrap{max-width:1100px;margin:0 auto;display:flex;flex-direction:column;gap:28px}h1{font-size:30px;line-height:1.2;margin:0;text-wrap:balance}h2{font-size:19px;margin:0 0 12px}
.lede{color:var(--soft);max-width:70ch;margin:8px 0 0}.kick{font:500 12px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--accent)}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px}.stat{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}.stat b{display:block;font-size:24px}.stat span{color:var(--soft);font-size:13px}
.panel{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px 20px}.safe{border-left:4px solid var(--amber);background:var(--amber-bg)}.safe ol{margin:0;padding-left:20px}
.found{list-style:none;margin:0;padding:0;display:grid;gap:10px}.f{display:flex;gap:12px;align-items:flex-start;border:1px solid var(--line);border-radius:10px;padding:12px 14px;background:var(--card)}
.f p{margin:4px 0 0;color:var(--soft);font-size:14px}.f .ev{font-size:13px}.f .ref{font:12px var(--mono);color:var(--accent)}.shots{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.shots img{max-width:100%;height:auto;border:1px solid var(--line);border-radius:6px}
.sev,.pill{font:600 11px/1 var(--mono);letter-spacing:.04em;text-transform:uppercase;padding:5px 7px;border-radius:6px;white-space:nowrap}
.f-critical .sev,.p-Critical{color:var(--crit);background:var(--crit-bg)}.f-high .sev,.p-High{color:var(--high);background:var(--high-bg)}.f-medium .sev,.p-Medium{color:var(--med);background:var(--med-bg)}.f-low .sev,.f-info .sev,.p-Low{color:var(--low);background:var(--low-bg)}
.s-Pass{color:var(--ok);background:var(--ok-bg)}.s-Fail{color:var(--crit);background:var(--crit-bg)}.s-Record{color:var(--amber);background:var(--amber-bg)}.s-Not{color:var(--low);background:var(--low-bg)}.s-Couldn{color:var(--med);background:var(--med-bg)}
.flow{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px}.step{all:unset;cursor:pointer;display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:14px}
.step:hover,.step.on{border-color:var(--accent);background:var(--accent-bg)}.step .n{font:600 13px var(--mono);color:var(--accent);min-width:22px}.step .c{font:12px var(--mono);color:var(--soft)}
.tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;position:sticky;top:env(safe-area-inset-top,0px);z-index:5;background:var(--bg);padding:10px 0}.tools input,.tools select{font:inherit;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px 10px;min-width:0}.tools input{flex:1 1 240px}.tools .shown{color:var(--soft);font-size:13px;margin-left:auto}
.list{display:flex;flex-direction:column;gap:8px}details.case{background:var(--card);border:1px solid var(--line);border-radius:10px}details.case[open]{border-color:var(--accent)}
summary{list-style:none;cursor:pointer;display:grid;grid-template-columns:100px 1fr auto auto;gap:12px;align-items:center;padding:11px 14px}summary::-webkit-details-marker{display:none}summary .id{font:500 12px var(--mono);color:var(--soft)}summary .ti{font-weight:500;min-width:0}
.mh{font:600 13px var(--mono);color:var(--soft);text-transform:uppercase;letter-spacing:.06em;margin:14px 2px 2px}.body{border-top:1px solid var(--line);padding:14px 16px 16px;display:grid;grid-template-columns:150px 1fr;gap:8px 16px;font-size:14px}
.body .k{color:var(--soft);font-size:12px;text-transform:uppercase;letter-spacing:.05em;padding-top:2px}.body .v{min-width:0;overflow-wrap:anywhere}.body ol{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:3px}.body pre{white-space:pre-wrap;font:13px var(--mono);margin:0}
dl.rules{display:grid;grid-template-columns:190px 1fr;gap:8px 18px;margin:0}dl.rules dt{font-weight:600}dl.rules dd{margin:0;color:var(--soft)}.foot{color:var(--soft);font-size:13px}
@media (max-width:640px){summary{grid-template-columns:1fr auto}summary .id{grid-column:1/-1}.body,dl.rules{grid-template-columns:1fr}h1{font-size:24px}}
</style>
<div class="wrap">
<header><div class="kick">Approval Workflows · Bid Proposal routing by General Details · DLF Hospitality UAT · 3 Nov 2026</div>
<h1>Condition-based approval routing — test cases and run</h1>
<p class="lede">The workflow builder, the General Details section of the PO form after awarding, the dependent dropdowns, which workflow matches, what Submit does, and the APIs behind them. Every case with an automated check carries the live result and a screenshot. Plain words; every click named as it reads on screen.</p></header>
<div class="stats"><div class="stat"><b>__TOTAL__</b><span>test cases</span></div><div class="stat"><b>__PASS__</b><span>pass</span></div><div class="stat"><b>__FAIL__</b><span>fail</span></div><div class="stat"><b>__REC__</b><span>record (rule unsettled)</span></div><div class="stat"><b>__NR__</b><span>not run (manual)</span></div><div class="stat"><b>__BUGS__</b><span>bugs &amp; gaps</span></div></div>
<section class="panel safe"><h2>Before you test</h2><ol>
<li>DLF Hospitality UAT has real people in it. Name every workflow “QA_Platform …”, make <b>yourself</b> its only approver, delete it when done.</li>
<li>Never submit through the company “test” catch-all workflows — they route to all DLF super admins / managers / members.</li>
<li>Use RFX-2112 (vendor Demo10, made by the test user). Reject your own approval afterwards so the event returns to draft.</li>
<li>Do not touch the “hello”, “GD Test …” and “test” workflows.</li>
<li><b>Record</b> = the rule is not settled: write what happens and raise it to product.</li></ol></section>
<section><h2>Bugs and gaps found</h2><ul class="found">__BUGS__</ul></section>
<section><h2>The flow (pass / cases)</h2><div class="flow">__FLOW__</div></section>
<section><h2>Test cases</h2><div class="tools"><input id="q" type="search" placeholder="Search title, steps, expected, observed, ID…">
<select id="st"><option value="">All statuses</option><option>Pass</option><option>Fail</option><option>Record</option><option>Not Run</option></select>
<select id="pr"><option value="">All priorities</option><option>Critical</option><option>High</option><option>Medium</option><option>Low</option></select>
<select id="ty"><option value="">All test types</option><option>Positive</option><option>Negative</option><option>Edge</option></select><span class="shown" id="shown"></span></div><div class="list" id="list"></div></section>
<section class="panel"><h2>Rules behind the cases</h2><dl class="rules">__RULES__</dl></section>
<p class="foot">Sources: PRD V2, backend PR Procol-Tech/procol-backend#17421, dashboard commit 02e23631e8, DLF UAT data, and the run of 3 Nov 2026 (scripts procol-ui-tests/scripts/aw-*.ts). Excel: Approval_Routing_Test_Cases_and_Bugs.xlsx (Test Cases with Status + Observed, Bug Sheet with screenshots, Run details, Summary, Rules).</p></div>
<script>
const CASES=__DATA__;const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
let mod="";const L=document.getElementById("list");
function row(c){const steps=c["Test Steps"].split("\\n").map(s=>"<li>"+esc(s.replace(/^\\d+\\.\\s*/,""))+"</li>").join("");const f=(k,v)=>v&&v!=="-"&&v!=="None"?`<div class="k">${k}</div><div class="v">${v}</div>`:"";
const st=c.Status;const cls="s-"+st.split(" ")[0].replace("'","");
return `<details class="case"><summary><span class="id">${c["Test Case ID"]}</span><span class="ti">${esc(c["Test Case Title"])}</span><span class="pill ${cls}">${esc(st)}</span><span class="pill p-${c.Priority}">${c.Priority}</span></summary>
<div class="body">${f("Scenario",esc(c.Scenario))}${f("Who / where",esc(c["User Role"]+" · "+c.Portal))}${f("Pre-conditions",esc(c["Pre-conditions"]))}${f("Test data",esc(c["Test Data"]))}<div class="k">Steps</div><div class="v"><ol>${steps}</ol></div>
<div class="k">Expected result</div><div class="v">${esc(c["Expected Result"])}</div>${f("Automated check",esc(c["Automated check"]))}${c.Observed?`<div class="k">Observed (live)</div><div class="v"><pre>${esc(c.Observed)}</pre></div>`:""}${c.shots&&c.shots.length?`<div class="k">Screenshots</div><div class="v shots">${c.shots.join("")}</div>`:""}${f("Note",esc(c["Notes for the tester"]))}</div></details>`}
function draw(){const q=document.getElementById("q").value.toLowerCase(),s=document.getElementById("st").value,p=document.getElementById("pr").value,t=document.getElementById("ty").value;let out="",last="",n=0;
for(const c of CASES){if(mod&&c.Module!==mod)continue;if(s&&c.Status!==s)continue;if(p&&c.Priority!==p)continue;if(t&&c["Test Type"]!==t)continue;if(q&&!(c["Test Case ID"]+" "+c["Test Case Title"]+" "+c["Test Steps"]+" "+c["Expected Result"]+" "+(c.Observed||"")).toLowerCase().includes(q))continue;
if(c.Module!==last){out+=`<div class="mh">${esc(c.Module)}</div>`;last=c.Module}out+=row(c);n++}L.innerHTML=out||'<p class="foot">No case matches.</p>';document.getElementById("shown").textContent=n+" of "+CASES.length+" shown"}
for(const id of ["q","st","pr","ty"])document.getElementById(id).addEventListener("input",draw);
document.querySelectorAll(".step").forEach(b=>b.addEventListener("click",()=>{const m=b.dataset.mod;mod=mod===m?"":m;document.querySelectorAll(".step").forEach(x=>x.classList.toggle("on",x.dataset.mod===mod));draw();document.getElementById("q").scrollIntoView({behavior:"smooth",block:"center"})}));draw();
</script>"""
out = (PAGE.replace("__TOTAL__", str(len(cases))).replace("__PASS__", str(counts["Pass"])).replace("__FAIL__", str(counts["Fail"]))
       .replace("__REC__", str(counts["Record"])).replace("__NR__", str(counts["Not Run"] + counts.get("Couldn't tell", 0))).replace("__BUGS__", str(len(BUGS)))
       .replace("__BUGS__", bugs_html).replace("__FLOW__", flow_html).replace("__RULES__", rules_html)
       .replace("__DATA__", json.dumps(slim, ensure_ascii=False).replace("</", "<\\/")))
# the first __BUGS__ was the count; put the list in the section
out = out.replace("<ul class=\"found\">" + str(len(BUGS)) + "</ul>", "<ul class=\"found\">" + bugs_html + "</ul>")
(HERE / "approval-routing" / "index.html").write_text(out)
print(f"cases {len(cases)}: {dict(counts)}; bugs {len(BUGS)}; checks {len(checks)}; page {len(out) // 1024} KB → {OUT_XLSX.name}")
