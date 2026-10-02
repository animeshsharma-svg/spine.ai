# The API suite, inside the platform

The purchase-order automation, vendored here so the platform is one folder.
It creates a real PO from `config/po-input.json` — header, line items, submit,
approve — and writes the run's evidence to `reports/`.

    npm run po                  # create a PO for the client named in po-input.json
    npm run po -- --client procol_sandbox_demo
    npm run po -- --no-submit   # stop after the line items
    npm run report:bugs         # config/findings.yaml -> reports/bug-report.html + findings.json

The platform runs `npm run po` for you: pick **Procol Sandbox Demo (PO)** and
press **Run PO automation**. Its reports are served at `/api/po-report` and the
curated bug list feeds the platform's bug sheet.

## What lives here

    config/po-input.json      what the next PO will contain — edit this
    config/clients/<id>.json  per-client wiring, written by discovery
    config/master-po.json     field semantics: what to send, resolve or assert
    config/findings.yaml      the hand-raised bug list (the D__ rows)
    src/cli/createPo.ts       the run itself
    src/lib, src/runtime      planning, relation resolution, approvals
    src/report                the run report and the bug sheet

## Credentials

`.env` here, or the parent repo's `.env` as a fallback. Copy `.env.example` and
fill in the two variables a client needs: its base URL and a token. The sandbox
token is a console session and expires — the platform checks it and says so.
