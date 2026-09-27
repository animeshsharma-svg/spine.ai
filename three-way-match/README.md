# three-way-match — purchase-to-bill, through the browser

Playwright UI journeys that sign in to the **Procol Sandbox Demo** deployment and
click a document all the way through: raise a purchase order, invoice it, receive
it (GRN), then bill it and let the 3-way match settle.

Vendored from `3-way_match/` in the parent repository so the QA platform is one
folder. The original still exists; this is the copy the platform runs.

## The platform runs one of these journeys

`finance.three_way` — "PO → Bill (3-way match)" — is registered in
`prototype/src/ui/uiFlowRunner.ts` and offered **only** on the Procol Sandbox
Demo account (id `900001`), because that is the deployment this suite's
`baseURL` and login point at. On a UAT company it could not sign in.

Pressing run in the platform shells out to exactly this:

```
npx playwright test tests/po_to_bill.spec.js -g "P2P Flow - 3 Way Match" --workers=1 --headed
```

The platform sets two environment variables the config reads:

- `HEADLESS=1` when "show the browser" is switched off
- `SLOWMO=0` to drop the 300ms demo pacing for an unattended run

## It narrates itself

Each phase prints a `[po-to-bill]` line. The platform parses those into steps —
on screen while it runs, and in the run's report afterwards — so a journey that
stops halfway says *which document it got as far as* rather than only `exit 1`.
Add a phase, add a line; nothing else needs changing.

## Running it yourself

```bash
npm install          # first time
npx playwright test tests/po_to_bill.spec.js --headed
```

The other specs here (`pr-to-bill`, `intake-to-bill`, `intake-to-bill-wsourcing`,
`three-way-match`) are not yet registered with the platform — they run from the
command line the same way.

## It creates real records

Every run raises a real PO, invoice, GRN and bill on the sandbox demo tenant.
That is a sandbox, so this is what it is for — but the documents are real and
they stay there.

**The sign-in credentials are hard-coded** in `utils/constants.js` (phone and
password for the sandbox demo account). They came with the suite. If this repo
is ever pushed anywhere public, move them to environment variables first.
