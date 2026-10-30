import json, re, html
from summaries import SUMMARY
C = json.load(open("cases.json"))
mods = []
for c in C:
    if c["Module"] not in mods: mods.append(c["Module"])
def mnum(m): return re.match(r"(\d+[A-Z]?)", m).group(1)
M = []
for m in mods:
    cs = [c for c in C if c["Module"] == m]
    n = mnum(m); name = m.split(". ", 1)[1]
    M.append({"k": n, "n": name, "s": SUMMARY.get(n, ""), "c": len(cs), "neg": sum(x["Test Type"] == "Negative" for x in cs), "crit": sum(x["Priority"] == "Critical" for x in cs)})
D = [[c["Test Case ID"], mnum(c["Module"]), c["Scenario"], c["Test Case Title"], c["User Role"], c["Portal"], c["Pre-conditions"], c["Test Data"],
      [re.sub(r"^\d+\.\s*", "", s) for s in c["Test Steps"].split("\n")], c["Expected Result"], c["Priority"], c["Test Type"], c.get("Configs Needed", "None")] for c in C]
data = json.dumps({"m": M, "d": D}, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
neg = sum(c["Test Type"] == "Negative" for c in C); crit = sum(c["Priority"] == "Critical" for c in C)
page = open("page_template.html").read().replace("__DATA__", data).replace("__TOTAL__", f"{len(C):,}").replace("__NEG__", str(neg)).replace("__CRIT__", str(crit)).replace("__MODS__", str(len(M)))
open("../procol-sourcing-test-cases.html", "w").write(page)
print("page bytes", len(page))
