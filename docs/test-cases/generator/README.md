# Sourcing test-case generator

Writes `../Procol-Sourcing-Test-Cases-PR-to-PO.xlsx` (the 13 columns of the PO Amendment sheet) and `../procol-sourcing-test-cases.html` (the readable page) from the modules here.

```
cd docs/test-cases/generator
python3 -c "import sys; sys.path.insert(0,'.'); exec(open('build.py').read())"   # cases.json + counts and duplicate check
python3 make_xlsx.py                                                              # the Excel sheet (needs openpyxl)
python3 make_page.py                                                              # the HTML page
```

`common.py` holds the shared clicks, people and test data; `m01`–`m12` the modules in flow order (PR → event → vendors → bids → negotiation → Master QCS → award → PO). Every rule in an expected result comes from the dashboard code (`procol-client-dashboard`, read-only), the backend error catalogue (`prototype/data/app-error-catalog.json`), the app refusal list (`procol-ui-tests/src/oracle/appRules.json`) or a verified UAT run; the "Product rules" sheet traces each quoted message to its source.
