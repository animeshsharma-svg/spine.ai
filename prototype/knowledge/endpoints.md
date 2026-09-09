# Procol backend — endpoint reference (UAT)

Base URL (UAT): `https://sec-api-v1.ag-ri.in/api`. Paths below are appended to it.
Auth headers: `access-token` = base64(appKey:appSecret[:sessionToken]), `lightspeed-token`, `app-version`.

## Auth
- `POST /v1/generate_otp` — start login (buyer: phone; vendor: email).
- `POST /v1/verify_otp` — complete login, returns `access_token`.

## Config / reads
- `GET /v1/dashboard_configuration` — per-client feature flags + `authorized_permissions` (module list). This is the source of the capability map.
- `GET /orders` — buyer's events/purchase-orders list.

## Sourcing events (RFx)
- `POST /event_groups` — create the event container (draft). Body: `{status:"draft", title, line_items:[{product_uuid, quantity:{unitSymbol,value}, product_quality_uuid}]}`. BOQ adds `config:{boq_based_rfx:true}`.
- `PATCH /event_groups/{uuid}` — finalize/publish (`status:"active"`, `draft_trade_request_uuids`, `audience_company_uuids`, bid times).
- `POST /trade/template_input?template_name=trade&additional_fields=order_details` — add a stage (technical RFP `stage_no:1 rfx_mode:"rfp"`; pricing RFQ `stage_no:2 rfx_mode:"rfq"`; auction `rfx_mode:"auction"` + `auction_config:rank|price`).
- `POST /trade/move_to_auction` — convert an RFQ stage to auction (F5).
- `POST /v1/trade/add_audience?id={tradeId}` — invite vendors to a stage.

## Bids (vendor + surrogate)
- `POST /template_responses` + `/create_page_responses` — technical response.
- `POST /template_responses/create_surrogate_response` — buyer bids on a vendor's behalf.
- `POST /v1/bids` → `/create_bid_products` → `PATCH /v1/bids/{uuid}` — priced bid lifecycle.
- `POST /bids/template_input` — surrogate RFQ bid.

## Evaluation & awarding
- `POST /evaluations` + `/evaluations/submit` — score a technical stage.
- `POST /proposal` → `/proposal/{uuid}/add_response` → `/approval_workflows` → `/submit` — award.

## Purchase requests
- `GET /purchase_requests?page=N` / `GET /purchase_requests/{id}` — list/read PRs.
- `POST /event_groups/{uuid}/pri_to_draft_project` — add PR items to a draft project.

## Master data
- `POST /product_categories` — create a category (`hierarchy_type: category|family|commodity`).
- `POST /products` — create a product (must sit under a family; `variants[]`, `product_code`).
- `POST /buyer_hubs/create` — create a location (needs `city_uuid` from `/cities/autocomplete`).
- `POST /teams` — create a team (`team_type:"purchase"`).
- `POST /users/create_user` — create a user. Body: `{name, email, phone, phone_prefix:"+91", role, teams:[{uuid,role}]}`. **Validation: `phone` must be a valid Indian mobile (10 digits, starts 6–9, e.g. `98xxxxxxxx`) and `phone_prefix` must be `+91`. Invalid → HTTP 422 `Invalid phone number`.** Permissions are granted by assigning `teams` at creation.

## Vendor discovery
- `GET /companies/vendorlist_filtered` — the client's vendor list (each vendor has `uuid` + `email`).
- `GET /companies/all_vendors?...` — broader vendor search.
