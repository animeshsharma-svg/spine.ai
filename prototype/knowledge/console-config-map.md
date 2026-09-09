# Procol Console Config Map — Flags & Module Permissions → Features

**What this is.** A retrieval-oriented knowledge document mapping Procol's tenant configuration
flags and RBAC module permissions to the user-facing features they control in the
`procol-client-dashboard` web app. Each entry is grounded in source evidence (file paths + short
code descriptions) so QA/test cases can reason about which flag/permission a behavior depends on.

**How config reaches the UI.** On login the app calls `GET /v1/dashboard_configuration`
(`src/redux/user/api.js:6`, `getUserConfig`). The response payload contains:
- `configurations.global_config` — feature flags,
- top-level tenant flags (destructured in `src/redux/user/index.js` ~lines 357–545),
- `authorized_permissions` — the RBAC permission list (`src/redux/user/index.js:101`,
  read as `config.authorized_permissions`).

The reducer (`FETCH_DASHBOARD_CONFIG_SUCCESS`, `src/redux/user/index.js:93+`) copies these into
Redux `state.user`, and components read them via selectors in `src/redux/user/selectors.js`.

**How module permissions gate the UI.** Routes are keyed `"<module>:<operation>"` (e.g.
`trade:create_record`) in `src/app/routes/routeConfigs.js`. `authorized_permissions` (array of
`{name, operation}`) is turned into allowed route keys by
`getDynamicAllowedKeys`/`getDynamicRoutes` (`src/app/routes/routeHelpers.js:39,52`). The sidebar
(`src/components/sidebar/sidebar.jsx:505+`) only renders a menu item when its
`"<name>:<operation>"` key exists in the built `routesObj`. So a missing `<module>:create_record`
permission removes the create route/entry point entirely (not just disables a button).

---

## Module permissions (RBAC — `authorized_permissions`)

### `trade:create_record` — Create sourcing events (auctions / RFx)
- **Controls:** access to the event creation routes and the "New Event" entry points.
- **ON:** user can open `/orders/create` and `/orders/quick-create` ("New Event"); routes
  `CREATE_AUCTION_ORDERS` / `CREATE_QUICK_ORDERS`.
- **OFF:** those routes/menu entry points are not generated, so the user cannot create events.
- **Evidence:** `src/app/routes/routeConfigs.js:354,362` — `key: "trade:create_record"`, paths
  `/orders/create`, `/orders/quick-create`, name "New Event". Sidebar module `name: "trade"`,
  `displayName: "events"` (`src/components/sidebar/sidebar.jsx:96`).
- **Related:** `trade:read_record` gates viewing events (`/orders`, `/orders/:id`,
  `routeConfigs.js` ORDERS / AUCTION_ORDER_DETAIL).

### `pr:create_record` / `pr` module — Purchase Requests, PR→Event
- **Controls:** the Purchase Requisitions module and creating PRs; PRs can then be converted into
  sourcing events.
- **ON:** "PR" sidebar module is shown; PR create/detail routes (`pr:read_record` for
  `/purchase-requisitions/...`) are available.
- **OFF:** PR module hidden; no PR creation or PR→Event flow.
- **Evidence:** sidebar module `name: "pr"` (`src/components/sidebar/sidebar.jsx:80`);
  PR routes keyed `pr:read_record` (`src/app/routes/routeConfigs.js` REORDER_DETAILS etc.). eRFx
  event creation is reachable from PR views — `selectIsErfxAllowed` consumed in
  `src/views/purchaseRequisition/purchaseRequisitions.jsx` and `purchaseCart/purchaseCart.jsx`.

### `product:create_record` — Create Products (master data)
- **Controls:** adding products and bulk-uploading products.
- **ON:** `/products/add` ("Add Product") and `/products/bulk-upload` routes available; "Products"
  sidebar entry (`product` module).
- **OFF:** add/bulk-upload product routes not generated.
- **Evidence:** `src/app/routes/routeConfigs.js:86` (`product:create_record`, `/products/add`),
  `:121` (bulk upload); sidebar `{ name: "product", displayName: "products" }`
  (`src/components/sidebar/sidebar.jsx:319`).

### `product_category:*` — Category master data
- **Controls:** viewing/editing product categories (hierarchy).
- **Evidence:** `src/app/routes/routeConfigs.js:488` (`product_category:update_record`,
  `/categories/:id`), `:496` (`product_category:read_record`, `/categories`); sidebar
  `{ name: "product_category", displayName: "categories" }` (`sidebar.jsx:328`).

### `buyer_hub:create_record` — Locations master data
- **Controls:** creating locations / location bulk upload ("Locations" module).
- **ON:** `/locations/bulk-upload` available; `buyer_hub:read_record` gates `/locations`.
- **Evidence:** `src/app/routes/routeConfigs.js:270` (read), `:279` (create); sidebar
  `{ name: "buyer_hub", displayName: "locations" }` (`sidebar.jsx:332`).

### `team` module — Teams master data
- **Controls:** the Teams module (create/manage teams).
- **Evidence:** sidebar `{ name: "team", displayName: "teams" }` (`src/components/sidebar/sidebar.jsx:331`).

### `user:*` — Users master data
- **Controls:** the Users module; `user:update_record` gates the user detail route.
- **Evidence:** `src/app/routes/routeConfigs.js:263` (`user:update_record`, `/users/:id`); sidebar
  `{ name: "user", displayName: "users" }` (`sidebar.jsx:333`). User creation is a drawer, see the
  phone-validation entry below (endpoint `POST /users/create_user`).

### `company:create_record` — Add Vendor (vendor master data)
- **Controls:** adding vendors, prospect onboarding (v3), vendor bulk upload.
- **Evidence:** `src/app/routes/routeConfigs.js:38,46,53` (`company:create_record`) → `/vendors/add`,
  `/vendors/onboarding-v3`, `/vendors/bulk-upload`. `company:read_record` gates `/vendors`.

---

## Tenant feature flags (from `global_config` / top-level config)

### `rfx_project_enabled` → multi-stage eRFx events
- **Controls:** whether the project/eRFx (multi-stage) sourcing flow is available.
- **ON:** "eRFX Project" / project creation menu is enabled; the New Event dropdown becomes visible
  and the "eRFX Project" option routes to `?projectCreation=true`.
- **OFF:** project/eRFx creation path is hidden; only the non-project (quick/auction) flow shows.
- **Evidence:** selector `selectIsErfxAllowed = state.user.rfx_project_enabled`
  (`src/redux/user/selectors.js:125`). In `src/views/orders/components/projectTable.jsx`: dropdown
  `visible={dropdownVisible && isErfxAllowed}` (~line 197) and the eRFX Project menu item routing to
  `CREATE_QUICK_ORDERS?projectCreation=true` (line 362). Also gates event config UI
  (`src/views/eventCreation/components/configurations/configuration.jsx:144,296`).

### `boq_in_erfx_allowed` (selector `isBoqInErfxAllowed`) → BOQ-based RFx projects
- **Controls:** the "BOQ based RFX Project" (Bill of Quantities) creation option.
- **ON:** an extra "BOQ based RFX Project" menu item appears under New Event, routing to
  `?projectCreation=true&boqProject=true`.
- **OFF:** BOQ project option is not rendered (only standard eRFX Project shown).
- **Evidence:** `src/redux/user/index.js:389,497` maps `boq_in_erfx_allowed` →
  `isBoqInErfxAllowed`; selector `selectIsBoqInErfxAllowed` (`selectors.js`). In
  `src/views/orders/components/projectTable.jsx:187`: `{isBoqInErfxAllowed && (<Menu.Item ... "BOQ
  based RFX Project" ...>)}`; BOQ URL built at line 151. Note this option is also nested inside the
  `isErfxAllowed` dropdown, so BOQ effectively requires both flags.

### `is_vendor_onboarding_enabled` → vendor onboarding flow
- **Controls:** whether tenant uses the structured vendor onboarding process (vs. plain vendor add).
- **Evidence:** destructured and stored to `state.user.is_vendor_onboarding_enabled`
  (`src/redux/user/index.js:367,471`). Works together with `vendor_onboarding_version` and
  `can_skip_vendor_onboarding` (selector `selectCanSkipVendorOnboarding`) which the invite/onboarding
  drawers read (`src/views/vendors/inviteNewVendor/inviteNewVendorDrawer.jsx:218`,
  `src/views/vendors/vendorOnboardingFlow/vendorOnboardingFlow.jsx:74`).

### `vendor_onboarding_version` (v1 / v2 / v3) → onboarding UX version
- **Controls:** which vendor onboarding experience/version is rendered.
- **Behavior:** selectors expose the version; `v1` vs `v2`/`v3` switch onboarding UIs and enable v3
  additional fields.
- **Evidence:** `selectVendorOnboardingVersion`, `selectIsVendorOnboardingV1`
  (`vendorOnboardingVersion === "v1"`) in `src/redux/user/selectors.js`. Hook
  `useVendorOnboardingVersion` derives `isVendorOnboardingV2 = version==="v2"`,
  `isVendorOnboardingV3 = version==="v3"` (`src/utils/hooks.js:396+`). Consumed in
  `src/views/vendors/vendors.jsx`, `src/views/vendorDetails/vendorInfo.jsx`, `vendorTabs.jsx`.

### `vendor_invitation_v2` → revamped vendor invitation flow
- **Controls:** the new vendor-invitation experience (supersedes legacy invite drawer).
- **ON (both switches):** revamped invitation flow is used — but only when the tenant is ALSO on
  onboarding version v2 or v3.
- **OFF:** legacy invite drawer is used.
- **Evidence:** `src/redux/user/index.js:378,482` (`vendor_invitation_v2` → `isVendorInvitationV2`);
  selector `selectIsVendorInvitationV2` (`selectors.js`). Combined gate in
  `src/utils/hooks.js:410` `useIsVendorInvitationV2Enabled` — returns
  `isVendorInvitationV2 && isVendorOnboardingV2OrV3`. Comment: "vendor_invitation_v2 supersedes the
  legacy drawer" (`src/views/vendors/vendorList.jsx:63`, `vendorListFlexi.jsx:61`).

### `hide_counter_offer_rfq` (selector `hideCounterOfferRfq`) → counter-offer visibility in RFQ
- **Controls:** whether the buyer counter-offer action is shown for RFQ-mode events.
- **ON:** counter-offer is suppressed specifically when the event is in RFQ mode.
- **OFF:** counter-offer action available (subject to other bid conditions).
- **Evidence:** `src/redux/user/index.js:426,536` (`hide_counter_offer_rfq` → `hideCounterOfferRfq`);
  selector `selectHideCounterOfferRfq` (`selectors.js`). In
  `src/components/dataGrid/formatters/comparisonHeaderFormatter.jsx:714`, `isCounterOfferAllowed`
  includes the condition `!(hideCounterOfferRfq && rfxMode === ORDER_MODE.rfq)`.

### `allowed_surrogate_bid_even_after_bid` (selector `allowedSurrogateBidEvenAfterBid`) → surrogate bidding after a bid exists
- **Controls:** whether a buyer can place a surrogate (on-behalf) bid for a vendor that already has
  a bid on record.
- **ON:** "Add Bid" surrogate action stays available even after the vendor has bid.
- **OFF:** when a vendor already `hasBid`, the add-surrogate-bid button is gated/hidden.
- **Evidence:** `src/redux/user/index.js:419,529` (`allowed_surrogate_bid_even_after_bid` →
  `allowedSurrogateBidEvenAfterBid`); selector `selectAllowedSurrogateBidEvenAfterBid`
  (`selectors.js`). Consumed via `useOrderDetailsViewModel`
  (`src/viewModels/orders/useOrderDetailsViewModel.js:129`) → passed down to
  `src/components/audienceList/audienceList.jsx:166` →
  `src/components/vendorListItem/vendorListItem.jsx:62`: `if (hasBid &&
  !allowedSurrogateBidEvenAfterBid) { ... }` gates the add-bid button.

---

## User creation — phone validation (`POST /users/create_user`)

### Endpoint
- **Where:** `createUser: (data) => promisifiedXHR("/users/create_user", "POST", data)`
  (`src/redux/users/api.js:44`). Payload built in
  `src/components/createUserForm/createUserDrawer.jsx` (`handleSubmitData`, ~line 305) includes
  `phone` and `phonePrefix`.

### Client-side phone validation (partial)
- **What it enforces client-side:** phone is required, must be digits-only, and must match the
  country's allowed length. It does NOT enforce the "starts with 6-9" rule client-side — that is
  server-side.
- **Evidence:** Yup schema in `src/components/createUserForm/createUserDrawer.jsx:107-121` —
  `phone` `.required(...)`, `.matches("^[0-9]+$", phoneNumberValid)`, and a `phone-length` test
  calling `validateCountryPhone(value, country)`.
- **`validateCountryPhone`** (`src/utils/index.js:195-203`): if country has array
  `phoneNumberLength`, requires `phoneNumberLength.includes(value.length)`; else length ≤ 20; with
  no country object, requires exactly length 10. For India `phone_number_length` is `["10"]`, so a
  10-digit number is required.

### `phonePrefix` ("+91")
- **Where set:** default `phonePrefix` in the create-user form comes from the logged-in user's
  country (`profile.country.phonePrefix`) — `createUserDrawer.jsx:216-218`; updated on country
  change at `:466` (`setValue("phonePrefix", country.phonePrefix)`). Country data (incl.
  `phone_prefix`, `phone_number_length`) comes from config via `selectCountry`/`selectUserCountry`
  (`src/redux/user/selectors.js`, fields `phonePrefix`, `phoneNumberLength`).

### Server-side rule (not in client repo)
- The "must start 6-9, 10 digits" mobile pattern and `phone_prefix` must be `"+91"`, returning
  **422 "Invalid phone number"**, is enforced by the backend `/users/create_user`. The client only
  checks digits-only + country length; the leading-digit (6-9) constraint is not present anywhere in
  `src/` (grep for `[6-9]`, "Invalid phone" returns no client validation). QA should treat 422
  "Invalid phone number" as a server contract, and expect the client to pass through non-6-9 numbers
  of valid length.
