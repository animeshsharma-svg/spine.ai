import json, sys
import common
for m in ["m01_setup_pr_events", "m02_create", "m03_participants_schedule_tnc", "m04_project_settings", "m05_eval_reject_activity", "m06_bidding", "m07_negotiation_qcs_award", "m08_e2e_extras", "m09_more", "m10_more", "m11_more", "m12_more", "m13_state_action_matrix"]:
    __import__(m)
import re
def mkey(m):
    g = re.match(r"(\d+)([A-Z]?)", m)
    return (int(g.group(1)), g.group(2))
C = sorted(common.CASES, key=lambda c: mkey(c["Module"]))
from collections import Counter
mods = Counter(c["Module"] for c in C)
for k, v in mods.items(): print(f"{v:4d}  {k}")
print("TOTAL", len(C), "| negative", sum(c["Test Type"]=="Negative" for c in C), "| edge", sum(c["Test Type"]=="Edge" for c in C))
ids = [c["Test Case ID"] for c in C]; assert len(ids) == len(set(ids)), "dup ids"
titles = Counter(c["Test Case Title"] for c in C); d = [t for t, n in titles.items() if n > 1]
print("duplicate titles:", len(d), d[:8])
exp = Counter(c["Expected Result"] for c in C); de = [(n, t[:90]) for t, n in exp.items() if n > 2]
print("expected used >2 times:", len(de), de[:8])
# "Configs Needed": the company settings each case depends on (prototype/scripts/configs-needed.ts fills
# configs_needed.json from Procol's settings catalogue; a case can also name its own with configs=[...]).
import os
CFG = json.load(open("configs_needed.json")) if os.path.exists("configs_needed.json") else {}
def shown(v):
    return "On" if v is True else "Off" if v is False else v if isinstance(v, str) else json.dumps(v)
for i, c in enumerate(C):
    need = c.pop("_configs", None) or CFG.get(c["Test Case ID"], [])
    cell = "\n".join(f"{n['key']} = {shown(n['value'])}" + (f" — {n['why']}" if n.get("why") else "") for n in need) or "None"
    out = {}
    for k, v in c.items():
        out[k] = v
        if k == "Pre-conditions": out["Configs Needed"] = cell
    C[i] = out
print("cases needing a company setting:", sum(c["Configs Needed"] != "None" for c in C))
json.dump(C, open("cases.json", "w"), indent=1, ensure_ascii=False)
