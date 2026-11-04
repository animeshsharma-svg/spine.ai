#!/usr/bin/env python3
"""Readable page for the PO / RFQ-Auction template cases (template-po-rfq/data.json → index.html)."""
import html
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
D = json.loads((HERE / "template-po-rfq" / "data.json").read_text())
cases, found, rules, modules = D["cases"], D["found"], D["rules"], D["modules"]

counts = {p: sum(1 for c in cases if c["Priority"] == p) for p in ("Critical", "High", "Medium", "Low")}
neg = sum(1 for c in cases if c["Test Type"] == "Negative")
mod_n = {m: sum(1 for c in cases if c["Module"] == m) for m in modules}
e = html.escape

found_html = "".join(
    f'<li class="f f-{sev.lower()}"><span class="sev">{e(sev)}</span><div><b>{e(what)}</b>'
    f'{"<p>" + e(why) + "</p>" if why else ""}<p class="ev">{e(ev)}</p><p class="ref">Cases: {e(ref)}</p></div></li>'
    for sev, what, why, ev, ref in found)
rules_html = "".join(f"<dt>{e(t)}</dt><dd>{e(r)}</dd>" for t, r in rules)
flow_html = "".join(
    f'<button class="step" data-mod="{e(m)}"><span class="n">{e(m.split(".")[0])}</span>'
    f'<span class="t">{e(m.split(". ", 1)[1])}</span><span class="c">{mod_n[m]}</span></button>' for m in modules)

PAGE = """<title>PO &amp; RFQ Template Cases</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root{--bg:#f6f7f9;--card:#fff;--ink:#16202c;--soft:#566476;--line:#dfe4ea;--accent:#1d5fbf;--accent-bg:#e8f0fc;
--amber:#9a5b00;--amber-bg:#fff4dc;--crit:#b42318;--crit-bg:#fdecea;--high:#b54708;--high-bg:#fff1e6;--med:#7a6400;--med-bg:#fbf6d9;
--low:#4b5868;--low-bg:#eef1f4;--ok:#1a7f4b;--mono:"IBM Plex Mono",ui-monospace,Menlo,monospace}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0f141b;--card:#171e27;--ink:#e6ebf1;--soft:#9aa7b6;--line:#2a3441;
--accent:#7fb0ff;--accent-bg:#1b2b44;--amber:#f2b552;--amber-bg:#33270f;--crit:#ff8a80;--crit-bg:#3a1714;--high:#ffb07a;--high-bg:#3a2414;
--med:#e8d26a;--med-bg:#332d10;--low:#b4c0cd;--low-bg:#222b36;--ok:#6fd3a0;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#0f141b;--card:#171e27;--ink:#e6ebf1;--soft:#9aa7b6;--line:#2a3441;--accent:#7fb0ff;--accent-bg:#1b2b44;
--amber:#f2b552;--amber-bg:#33270f;--crit:#ff8a80;--crit-bg:#3a1714;--high:#ffb07a;--high-bg:#3a2414;--med:#e8d26a;--med-bg:#332d10;
--low:#b4c0cd;--low-bg:#222b36;--ok:#6fd3a0;color-scheme:dark}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--ink);font:15px/1.55 "IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif;
padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:28px 64px}
.wrap{max-width:1080px;margin:0 auto;display:flex;flex-direction:column;gap:28px}
h1{font-size:30px;line-height:1.2;margin:0;text-wrap:balance}
h2{font-size:19px;margin:0 0 12px;text-wrap:balance}
.lede{color:var(--soft);max-width:68ch;margin:8px 0 0}
.kick{font:500 12px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--accent)}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px}
.stat{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.stat b{display:block;font-size:24px}.stat span{color:var(--soft);font-size:13px}
.panel{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px 20px}
.safe{border-left:4px solid var(--amber);background:var(--amber-bg)}
.safe ol{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:4px}
.found{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.f{display:flex;gap:12px;align-items:flex-start;border:1px solid var(--line);border-radius:10px;padding:12px 14px;background:var(--card)}
.f p{margin:4px 0 0;color:var(--soft);font-size:14px}.f .ev{font-size:13px}.f .ref{font:12px var(--mono);color:var(--accent)}
.sev,.pill{font:600 11px/1 var(--mono);letter-spacing:.04em;text-transform:uppercase;padding:5px 7px;border-radius:6px;white-space:nowrap}
.f-critical .sev,.p-Critical{color:var(--crit);background:var(--crit-bg)}.f-high .sev,.p-High{color:var(--high);background:var(--high-bg)}
.f-medium .sev,.p-Medium{color:var(--med);background:var(--med-bg)}.f-low .sev,.p-Low{color:var(--low);background:var(--low-bg)}
.t-Negative{color:var(--crit)}.t-Edge{color:var(--amber)}.t-Positive{color:var(--ok)}
.flow{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px}
.step{all:unset;cursor:pointer;display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;background:var(--card);
border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:14px}
.step:hover,.step.on{border-color:var(--accent);background:var(--accent-bg)}
.step .n{font:600 13px var(--mono);color:var(--accent);min-width:22px}.step .c{font:12px var(--mono);color:var(--soft)}
.tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;position:sticky;top:env(safe-area-inset-top,0px);z-index:5;background:var(--bg);padding:10px 0}
.tools input,.tools select{font:inherit;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px 10px;min-width:0}
.tools input{flex:1 1 240px}.tools .shown{color:var(--soft);font-size:13px;margin-left:auto}
.list{display:flex;flex-direction:column;gap:8px}
details.case{background:var(--card);border:1px solid var(--line);border-radius:10px}
details.case[open]{border-color:var(--accent)}
summary{list-style:none;cursor:pointer;display:grid;grid-template-columns:110px 1fr auto auto;gap:12px;align-items:center;padding:11px 14px}
summary::-webkit-details-marker{display:none}
summary .id{font:500 12px var(--mono);color:var(--soft)}summary .ti{font-weight:500;min-width:0}
summary .ty{font:12px var(--mono)}
.mh{font:600 13px var(--mono);color:var(--soft);text-transform:uppercase;letter-spacing:.06em;margin:14px 2px 2px}
.body{border-top:1px solid var(--line);padding:14px 16px 16px;display:grid;grid-template-columns:150px 1fr;gap:8px 16px;font-size:14px}
.body .k{color:var(--soft);font-size:12px;text-transform:uppercase;letter-spacing:.05em;padding-top:2px}
.body .v{min-width:0;overflow-wrap:anywhere}.body ol{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:3px}
.watch{background:var(--amber-bg);color:var(--amber);border-radius:4px;padding:0 3px;font-weight:600}
dl.rules{display:grid;grid-template-columns:190px 1fr;gap:8px 18px;margin:0}dl.rules dt{font-weight:600}dl.rules dd{margin:0;color:var(--soft)}
.foot{color:var(--soft);font-size:13px}
@media (max-width:640px){summary{grid-template-columns:1fr auto}summary .id{grid-column:1/-1}summary .ty{display:none}
.body,dl.rules{grid-template-columns:1fr}.body .k{padding-top:6px}h1{font-size:24px}}
</style>
<div class="wrap">
<header>
<div class="kick">Manage Templates · test cases · 30 Oct 2026</div>
<h1>Purchase Order and RFQ / Auction templates</h1>
<p class="lede">The template decides how an event is built: its columns, who fills them, the sums and who ranks L1. These cases walk the builder in the order a tester uses it, then check the template inside real events with worked-out numbers. Plain words; every click named as it reads on screen.</p>
</header>
<div class="stats">
<div class="stat"><b>__TOTAL__</b><span>test cases</span></div>
<div class="stat"><b>__MODS__</b><span>modules, in flow order</span></div>
<div class="stat"><b>__CRIT__</b><span>critical</span></div>
<div class="stat"><b>__NEG__</b><span>negative (the app should refuse)</span></div>
<div class="stat"><b>__FOUND__</b><span>problems found while writing</span></div>
</div>
<section class="panel safe"><h2>Before you test</h2><ol>
<li>Test on <b>PROCOL DEMO</b>. Name every template “QA_Platform …” and delete it when you finish.</li>
<li>Never press <b>Update</b> on a template other people use. Copy it first: updating may wipe its Terms &amp; Conditions.</li>
<li>Do not build PO templates on a company that has none, such as <b>GMMCO LIMITED</b>. It can break that company's PO step after award.</li>
<li>In events, use only the QA test vendors (QA_Platform names, @example.com).</li>
<li><span class="watch">Watch out</span> means a problem is already suspected. <b>Record</b> means the rule is not settled: write down what happens.</li>
</ol></section>
<section><h2>Found while writing</h2><p class="lede" style="margin:-4px 0 12px">From the product code and an API check on UAT (PROCOL DEMO, 30 Oct) that sent the builder's exact requests. Every template it made was deleted.</p>
<ul class="found">__FOUND_HTML__</ul></section>
<section><h2>The flow</h2><div class="flow">__FLOW__</div></section>
<section>
<h2>Test cases</h2>
<div class="tools">
<input id="q" type="search" placeholder="Search title, steps, expected result, ID…">
<select id="pr"><option value="">All priorities</option><option>Critical</option><option>High</option><option>Medium</option><option>Low</option></select>
<select id="ty"><option value="">All test types</option><option>Positive</option><option>Negative</option><option>Edge</option></select>
<select id="wa"><option value="">All cases</option><option value="w">Only “Watch out” cases</option></select>
<span class="shown" id="shown"></span>
</div>
<div class="list" id="list"></div>
</section>
<section class="panel"><h2>Rules behind the cases</h2><dl class="rules">__RULES__</dl></section>
<p class="foot">Source: the Template Studio code (fe-main-uat-test), the backend template rules (main) and the 30 Oct API check. The Excel file Template_Studio_PO_RFQ_Test_Cases.xlsx has the same cases in the team's 14-column layout, plus a Status column and a notes column for the tester.</p>
</div>
<script>
const CASES=__DATA__;
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const mark=s=>esc(s).replace(/(Watch out:?)/g,'<span class="watch">$1</span>').replace(/\\bRecord\\b/g,'<b>Record</b>');
let mod="";const L=document.getElementById("list");
function row(c){const steps=c["Test Steps"].split("\\n").map(s=>"<li>"+esc(s.replace(/^\\d+\\.\\s*/,""))+"</li>").join("");
const f=(k,v)=>v&&v!=="-"&&v!=="None"?`<div class="k">${k}</div><div class="v">${v}</div>`:"";
return `<details class="case"><summary><span class="id">${c["Test Case ID"]}</span><span class="ti">${esc(c["Test Case Title"])}</span>
<span class="ty t-${c["Test Type"]}">${c["Test Type"]}</span><span class="pill p-${c["Priority"]}">${c["Priority"]}</span></summary>
<div class="body">${f("Scenario",esc(c.Scenario))}${f("Who / where",esc(c["User Role"]+" · "+c.Portal))}${f("Pre-conditions",esc(c["Pre-conditions"]))}
${f("Configs needed",esc(c["Configs Needed"]))}${f("Test data",esc(c["Test Data"]).replace(/\\n/g,"<br>"))}<div class="k">Steps</div><div class="v"><ol>${steps}</ol></div>
<div class="k">Expected result</div><div class="v">${mark(c["Expected Result"])}</div>${f("Note",esc(c["Notes for the tester"]))}</div></details>`}
function draw(){const q=document.getElementById("q").value.toLowerCase(),p=document.getElementById("pr").value,t=document.getElementById("ty").value,w=document.getElementById("wa").value;
let out="",last="",n=0;for(const c of CASES){if(mod&&c.Module!==mod)continue;if(p&&c.Priority!==p)continue;if(t&&c["Test Type"]!==t)continue;
if(w&&!/Watch out/.test(c["Expected Result"]))continue;
if(q&&!(c["Test Case ID"]+" "+c["Test Case Title"]+" "+c["Test Steps"]+" "+c["Expected Result"]+" "+c["Test Data"]).toLowerCase().includes(q))continue;
if(c.Module!==last){out+=`<div class="mh">${esc(c.Module)}</div>`;last=c.Module}out+=row(c);n++}
L.innerHTML=out||'<p class="foot">No case matches.</p>';document.getElementById("shown").textContent=n+" of "+CASES.length+" shown"}
for(const id of ["q","pr","ty","wa"])document.getElementById(id).addEventListener("input",draw);
document.querySelectorAll(".step").forEach(b=>b.addEventListener("click",()=>{const m=b.dataset.mod;mod=mod===m?"":m;
document.querySelectorAll(".step").forEach(x=>x.classList.toggle("on",x.dataset.mod===mod));draw();
document.getElementById("q").scrollIntoView({behavior:"smooth",block:"center"})}));
draw();
</script>
"""
out = (PAGE.replace("__TOTAL__", str(len(cases))).replace("__MODS__", str(len(modules)))
       .replace("__CRIT__", str(counts["Critical"])).replace("__NEG__", str(neg)).replace("__FOUND__", str(len(found)))
       .replace("__FOUND_HTML__", found_html).replace("__FLOW__", flow_html).replace("__RULES__", rules_html)
       .replace("__DATA__", json.dumps(cases, ensure_ascii=False).replace("</", "<\\/")))
(HERE / "template-po-rfq" / "index.html").write_text(out)
print("page", len(out) // 1024, "KB")
