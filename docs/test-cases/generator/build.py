import json, sys
import common
for m in ["m01_setup_pr_events", "m02_create", "m03_participants_schedule_tnc", "m04_project_settings", "m05_eval_reject_activity", "m06_bidding", "m07_negotiation_qcs_award", "m08_e2e_extras", "m09_more", "m10_more", "m11_more", "m12_more"]:
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
json.dump(C, open("cases.json", "w"), indent=1, ensure_ascii=False)
