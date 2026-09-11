# Client configs

One JSON file per client, matching `ClientConfig` in
[`src/types.ts`](../../src/types.ts).

**These files are generated. Do not hand-edit them** — `npm run discover`
overwrites the datasources and fields wholesale. Anything you want to persist
belongs in [`../master-po.json`](../master-po.json) instead.

## Adding a client

Create `<clientId>.json` with just this — discovery fills in the rest:

```jsonc
{
  "id": "ashoka",
  "displayName": "Ashoka",
  "baseUrlEnv": "ASHOKA_BASE_URL",
  "auth": { "type": "apiKey", "headerName": "access-token", "apiKeyEnv": "ASHOKA_ACCESS_TOKEN" },
  "datasources": {}
}
```

`auth` also supports `{"type":"bearer","tokenEnv":"…"}`,
`{"type":"basic","usernameEnv":"…","passwordEnv":"…"}` and `{"type":"none"}`.
`endpoints` may be omitted — the defaults in
[`src/lib/endpoints.ts`](../../src/lib/endpoints.ts) are written in on first
discovery, and only need overriding if a client is on a different API shape.

Then:

```
npm run discover -- --client ashoka
```

## What discovery writes

- `datasources` keyed by **key_attribute** (`p2p_purchase_order`), each with its
  per-client `uuid`, and every field's `uuid`, `mandatory`, `dataType`,
  dropdown `options`, relation target and date `format`.
- `role`, `lineItemKeyAttribute` / `parentKeyAttribute`, and
  `submitAutomationUuid` for document headers.
- `discoveredAt`. **Its absence marks a config as predating the current
  pipeline** — several quality assertions skip with a warning rather than
  asserting against stale data.

`npm run audit` additionally writes `numericId` and the `autofill` graph.

## Fields that disappear

A field previously recorded but missing from a new schema is marked
`present: false` rather than deleted, so "this client dropped a field" shows up
as a readable diff instead of a silent removal.
