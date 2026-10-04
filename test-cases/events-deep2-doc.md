# Event documents and attachments

Deep cases for how a document enters or leaves a sourcing event: the generic upload the buyer/vendor screens use
(`POST /trade/upload_file`), the template-question image upload (`POST /templates/upload_attachment`), the event-level
attachment list and its company-folder guard (`PATCH /event_groups/:id`), the round's T&C files (`PATCH /trade/:id`),
files carried on remarks (withdrawal notice, surrogate-bid reference), the event's Reports list
(`GET /event_groups/:id/get_all_attachments`) and the signed link that opens a stored file without sign-in
(`GET /v1/attachments/open`). Every case is grounded in `procol-backend` at `origin/main` (paths relative to that repo)
or `procol-client-dashboard` for UI cases.

Cases whose Trace names an `EVD2-DOC-NNN` id have a runnable twin in `prototype/data/deep2-cases/doc.json`. Upload,
event, round, withdrawal and reports twins use the plan runner (each gets its own fresh event); template-image and
open-link twins use the direct runner and only send requests refused before any write. Exactly two twins store a file:
EVD2-DOC-001 (one private 2-byte object `QA_Platform_<stamp>.pdf`) and EVD2-DOC-015 (one private 0-byte object, the
defect it records). Twins that record present (suspected-wrong) behaviour are written so today's behaviour FAILS them: a
stored-and-served bad value is caught by a read-back, a success-without-file by `expected: reject`, a crash by
`expected: no-5xx`. Left manual: anything needing the real bucket name or another company's real file, a second buyer
user, an auction/offline stage, a counter offer on a real line, very large payloads, two requests in one second, the
vendor app on a console-only endpoint, and inspecting a downloaded file's contents. `Z2dnWmdaUWtnZw==` decodes to id
999999999 (no such row); `WrongUuid1=` decodes to nil; a folder named `QA_Platform_999999999` does not exist — the
guard cases prove the check, not a real leak.

## 1. Uploading a document — `POST /trade/upload_file`

#### API-EVDDOC-001 — A buyer uploads a small T&C document
- **Why it matters.** Every attachment on an event is first uploaded through this call; the baseline for all refusals below.
- **Setup.** Signed in as the QA buyer. No event. Stores one private 2-byte object.
- **Steps.** `POST /trade/upload_file` with `{"name": "QA_Platform_{{stamp}}.pdf", "data": "UUE=", "type": "t_and_c"}`.
- **Expected.** The file is stored privately under the company's T&C folder; the reply returns the cleaned name, the private storage link and a 2-hour viewing link. HTTP 200, `success: true`, message 'Successfully uploaded File'.
- **Oracle.** 200; `url` contains `trade_files/terms_and_conditions/<company>_<id>/`; `public_url` is a signed link.
- **Trace.** P1 · automate · `EVD2-DOC-001` · `app/controllers/api/trade_controller.rb:1742-1764` · `app/controllers/concerns/s3_upload.rb:83-101`

#### API-EVDDOC-002 — An upload without a file name is refused
- **Why it matters.** Name, content and type are checked together before anything is written.
- **Setup.** QA buyer, no event.
- **Steps.** `POST /trade/upload_file` with `{"data": "UUE=", "type": "t_and_c"}`.
- **Expected.** Refused, nothing stored. HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 code 2.
- **Trace.** P2 · automate · `EVD2-DOC-002` · `app/controllers/api/trade_controller.rb:1747-1749`

#### API-EVDDOC-003 — An upload without content is refused
- **Why it matters.** A file with no content must never create an empty object.
- **Setup.** QA buyer, no event.
- **Steps.** `POST /trade/upload_file` with `{"name": "QA_Platform_{{stamp}}.pdf", "type": "t_and_c"}`.
- **Expected.** Refused. HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 code 2.
- **Trace.** P2 · automate · `EVD2-DOC-003` · `app/controllers/api/trade_controller.rb:1747-1749`

#### API-EVDDOC-004 — An upload without a document type is refused
- **Why it matters.** The type decides the storage folder.
- **Setup.** QA buyer, no event.
- **Steps.** `POST /trade/upload_file` with `{"name": "QA_Platform_{{stamp}}.pdf", "data": "UUE="}`.
- **Expected.** Refused. HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 code 2.
- **Trace.** P2 · automate · `EVD2-DOC-004` · `app/controllers/api/trade_controller.rb:1747-1749`

#### API-EVDDOC-005 — A file name of only spaces is refused
- **Why it matters.** A blank name would become an extension-less storage key.
- **Setup.** QA buyer, no event.
- **Steps.** `POST /trade/upload_file` with name `"   "`, data `UUE=`, type `t_and_c`.
- **Expected.** HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 code 2.
- **Trace.** P2 · automate · `EVD2-DOC-005` · `app/controllers/api/trade_controller.rb:1747-1749`

#### API-EVDDOC-006 — An unknown document type is refused
- **Why it matters.** Only `t_and_c` and `product_sheet` map to a folder; any other value must not invent one.
- **Setup.** QA buyer, no event.
- **Steps.** `POST /trade/upload_file` with type `invoice` and a valid name and data.
- **Expected.** HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 code 2.
- **Trace.** P1 · automate · `EVD2-DOC-006` · `app/controllers/api/trade_controller.rb:1751-1752` · `app/controllers/concerns/s3_upload.rb:9-12`

#### API-EVDDOC-007 — The document type is case-sensitive
- **Why it matters.** Pins the exact contract; `T_AND_C` is not `t_and_c`.
- **Setup.** QA buyer, no event.
- **Steps.** `POST /trade/upload_file` with type `T_AND_C`.
- **Expected.** HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 code 2.
- **Trace.** P2 · automate · `EVD2-DOC-007` · `app/controllers/concerns/s3_upload.rb:9-12`

The allowed extensions are `.xlsx .xls .csv .pdf .zip .jpg .jpeg .png .doc .docx .txt .msg .eml .dwg .cdr`
(compared case-insensitively, last extension only). Cases 008–014 confirm the list and the name-cleaning step.

#### API-EVDDOC-008 — An executable is refused
- **Why it matters.** Whatever is stored here is later handed to vendors as a signed download link, so the allow-list must hold.
- **Setup.** QA buyer, no event.
- **Steps.** `POST /trade/upload_file` with name `QA_Platform_{{stamp}}.exe`.
- **Expected.** Refused, nothing stored. HTTP 422, code 484 'File type not allowed'.
- **Oracle.** 422 code 484.
- **Trace.** P1 · automate · `EVD2-DOC-008` · `app/controllers/api/trade_controller.rb:1756-1757` · `app/controllers/concerns/utils.rb:746-749`

#### API-EVDDOC-009 — An HTML page is refused
- **Why it matters.** An HTML file served from Procol storage would run script in whoever opens it.
- **Setup.** QA buyer, no event.
- **Steps.** `POST /trade/upload_file` with name `QA_Platform_{{stamp}}.html`.
- **Expected.** HTTP 422, code 484 'File type not allowed'.
- **Oracle.** 422 code 484.
- **Trace.** P1 · automate · `EVD2-DOC-009` · `app/controllers/concerns/utils.rb:746-749`

#### API-EVDDOC-010 — An SVG image is refused
- **Why it matters.** SVG can carry script just like HTML, so it is kept off the list.
- **Setup.** QA buyer, no event.
- **Steps.** `POST /trade/upload_file` with name `QA_Platform_{{stamp}}.svg`.
- **Expected.** HTTP 422, code 484 'File type not allowed'.
- **Oracle.** 422 code 484.
- **Trace.** P1 · automate · `EVD2-DOC-010` · `app/controllers/concerns/utils.rb:746-749`

#### API-EVDDOC-011 — "file.pdf.exe" is judged by its last extension
- **Why it matters.** Only the final extension may count.
- **Setup.** QA buyer, no event.
- **Steps.** `POST /trade/upload_file` with name `QA_Platform_{{stamp}}.pdf.exe`.
- **Expected.** HTTP 422, code 484 'File type not allowed'.
- **Oracle.** 422 code 484.
- **Trace.** P1 · automate · `EVD2-DOC-011` · `app/controllers/concerns/utils.rb:746-749`

#### API-EVDDOC-012 — A file without an extension is refused
- **Why it matters.** It cannot be typed or previewed safely.
- **Setup.** QA buyer, no event.
- **Steps.** `POST /trade/upload_file` with name `QA_Platform_{{stamp}}`.
- **Expected.** HTTP 422, code 484 'File type not allowed'.
- **Oracle.** 422 code 484.
- **Trace.** P2 · automate · `EVD2-DOC-012` · `app/controllers/concerns/utils.rb:746-749`

#### API-EVDDOC-013 — A look-alike Unicode extension is refused
- **Why it matters.** A full-width `ｐ` reads as `.pdf` on screen; the name cleaner replaces every character outside `0-9 A-Z a-z . -` with `_`, so `.ｐdf` becomes `._df` and no longer matches.
- **Setup.** QA buyer, no event.
- **Steps.** `POST /trade/upload_file` with name `QA_Platform_{{stamp}}.ｐdf`.
- **Expected.** HTTP 422, code 484 'File type not allowed'.
- **Oracle.** 422 code 484.
- **Trace.** P2 · automate · `EVD2-DOC-013` · `config/initializers/string.rb:9,88-91` · `app/controllers/api/trade_controller.rb:1756-1757`

#### API-EVDDOC-014 — PowerPoint files are not accepted today
- **Why it matters.** Buyers often attach `.pptx` specs; recording the real list makes any future change visible.
- **Setup.** QA buyer, no event.
- **Steps.** `POST /trade/upload_file` with name `QA_Platform_{{stamp}}.pptx`.
- **Expected (today).** HTTP 422, code 484 'File type not allowed'.
- **Oracle.** 422 code 484.
- **Trace.** P2 · automate · `EVD2-DOC-014` · `app/controllers/concerns/utils.rb:746-749`

#### API-EVDDOC-015 — Content that is not valid base64 is stored as an empty file
- **Why it matters.** A silently empty attachment is only discovered when the other side opens it.
- **Setup.** QA buyer, no event. Today stores one private 0-byte object.
- **Steps.** `POST /trade/upload_file` with a valid name and type and data `!!!!`.
- **Expected (today).** Should be refused (422). Today: HTTP 200 'Successfully uploaded File' and a 0-byte file — the decoder silently drops invalid characters.
- **Oracle.** A refusal passes; a 200 is the defect.
- **Trace.** P2 · automate · `EVD2-DOC-015` · `app/controllers/concerns/s3_upload.rb:83-101`

#### API-EVDDOC-016 — Numeric content is reported as uploaded although nothing was stored
- **Why it matters.** The API says "Successfully uploaded File" for a file it never stored; only the screen's own check of `url` hides it.
- **Setup.** QA buyer, no event. Nothing is stored.
- **Steps.** `POST /trade/upload_file` with data `12345` (a number).
- **Expected (today).** Should be refused (422). Today: HTTP 200, `success: true`, `url: null`, `public_url: null` — decoding a number raises, the helper swallows every error and returns nil, and the controller never checks the result.
- **Oracle.** A refusal passes; a 200 with a null url is the defect.
- **Trace.** P2 · automate · `EVD2-DOC-016` · `app/controllers/concerns/s3_upload.rb:92-100` · `app/controllers/api/trade_controller.rb:1758-1763`

#### API-EVDDOC-017 — A 300-character file name is reported as uploaded although nothing was stored
- **Why it matters.** Long, descriptive document names are normal in tenders; the user is told it worked.
- **Setup.** QA buyer, no event. Nothing is stored.
- **Steps.** `POST /trade/upload_file` with a valid type and data and a 300-character name ending `.pdf`.
- **Expected (today).** Should be refused or stored under a shortened name. Today: HTTP 200, `success: true`, `url: null` — the temp file is named `temp_<name>`, exceeding the 255-byte file-name limit; the error is swallowed.
- **Oracle.** A refusal passes; a 200 with a null url is the defect.
- **Trace.** P2 · automate · `EVD2-DOC-017` · `app/controllers/concerns/s3_upload.rb:90,96-100`

#### API-EVDDOC-018 — A vendor is allowed to upload and is stopped only by validation
- **Why it matters.** Vendors upload bid documents through the same call; a permission regression would show as 455 here.
- **Setup.** QA vendor 1 on the vendor app (allowed to call this action). No event.
- **Steps.** As QA vendor 1, `POST /trade/upload_file` with type `invoice`.
- **Expected.** Past the permission check, refused by validation. HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 code 2, never 455.
- **Trace.** P2 · automate · `EVD2-DOC-018` · `app/policies/trade_request_policy.rb:200-202` · `app/models/user.rb:896-899`

#### API-EVDDOC-019 — A path in the file name never leaves the company folder
- **Why it matters.** `../../` in a name must not move the object into another folder.
- **Setup.** QA buyer. Manual: a successful upload stores a file and the runner cannot read the reply name.
- **Steps.** `POST /trade/upload_file` with name `../../QA_Platform_x.pdf`.
- **Expected.** Stored inside the own company folder; slashes become `_` (name comes back `.._.._QA_Platform_x.pdf`). HTTP 200.
- **Oracle.** The returned `url` has the expected folder depth and the own company id.
- **Trace.** P1 · manual · `config/initializers/string.rb:9,88-91` · `app/controllers/api/trade_controller.rb:1755-1758`

#### API-EVDDOC-020 — There is no size limit on the server
- **Why it matters.** The 20 MB limit lives only in the screen; the whole file is decoded in memory.
- **Setup.** QA buyer; a 30 MB PDF as base64. Manual (large payload, stores a file).
- **Steps.** `POST /trade/upload_file` with that payload.
- **Expected (today).** Accepted unless the proxy cuts it (413). Should be refused above the product limit.
- **Oracle.** Status and stored object size.
- **Trace.** P2 · manual · `app/controllers/api/trade_controller.rb:1742-1764` · `procol-client-dashboard/src/components/sheet/multipleAttachments.jsx:35,282-286`

#### API-EVDDOC-021 — Two uploads with the same name in the same second overwrite each other
- **Why it matters.** The key is `<company>_<epoch seconds>_<name>`; two colleagues uploading "Terms.pdf" in the same second share one key.
- **Setup.** Two buyer sessions of one company. Manual (needs parallel requests).
- **Steps.** Send two uploads named `QA_Platform_same.pdf` with different content within one second.
- **Expected (today).** Both answer 200 with the same `url`; the first link now opens the second file. Should be unique per upload.
- **Oracle.** Identical `url`; the first link returns the second content.
- **Trace.** P2 · manual · `app/controllers/api/trade_controller.rb:1758`

#### API-EVDDOC-022 — A buyer with only intake access can still upload event documents
- **Why it matters.** The permission is "can read events OR can read intake requests" — flagged in the code as a temporary hotfix.
- **Setup.** A buyer whose role lacks trade read but has intake read. Manual (needs that user).
- **Steps.** As that buyer, `POST /trade/upload_file` with a valid small PDF.
- **Expected (today).** HTTP 200. Should be limited to users who can work on events.
- **Oracle.** 200 for a user who gets 455 on `GET /event_groups`.
- **Trace.** P2 · manual · `app/policies/trade_request_policy.rb:200-202`

#### API-EVDDOC-023 — An upper-case extension is accepted
- **Why it matters.** Scanner and camera files are often `.PDF` / `.JPG`.
- **Setup.** QA buyer. Manual (stores a file).
- **Steps.** `POST /trade/upload_file` with name `QA_Platform_x.PDF`.
- **Expected.** Accepted (extension compared lower-cased). HTTP 200.
- **Oracle.** 200, non-null `url`.
- **Trace.** P2 · manual · `app/controllers/concerns/utils.rb:746-749`

#### API-EVDDOC-024 — Content sent with its "data:…;base64," prefix is stored corrupted
- **Why it matters.** The screen strips the prefix; an integration that does not is told it worked and stores a broken file.
- **Setup.** QA buyer. Manual (stores a file).
- **Steps.** `POST /trade/upload_file` with data `data:application/pdf;base64,UUE=`.
- **Expected (today).** HTTP 200; the file starts with bytes decoded from the prefix text. Should be refused or the prefix stripped server-side.
- **Oracle.** The file's first bytes are not 'QA'.
- **Trace.** P2 · manual · `app/controllers/concerns/s3_upload.rb:92` · `procol-client-dashboard/src/components/sheet/multipleAttachments.jsx:318-322`

## 2. Template question image — `POST /templates/upload_attachment`

#### API-EVDDOC-025 — A template image without a name is refused
- **Why it matters.** Baseline validation of the RFI/technical template builder's image upload.
- **Setup.** QA buyer (console only; the vendor app may not call this action). No event.
- **Steps.** `POST /templates/upload_attachment` with `{"data": "UUE="}`.
- **Expected.** HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 code 2.
- **Trace.** P2 · automate · `EVD2-DOC-025` · `app/controllers/api/templates_controller.rb:57-62`

#### API-EVDDOC-026 — A template image without content is refused
- **Why it matters.** No empty images in a template every vendor will see.
- **Setup.** QA buyer, no event.
- **Steps.** `POST /templates/upload_attachment` with `{"name": "QA_Platform_{{stamp}}.png"}`.
- **Expected.** HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 code 2.
- **Trace.** P2 · automate · `EVD2-DOC-026` · `app/controllers/api/templates_controller.rb:57-62`

#### API-EVDDOC-027 — An executable as a template image is refused
- **Why it matters.** Template images are shown to every vendor answering the template, so the same allow-list applies.
- **Setup.** QA buyer, no event.
- **Steps.** `POST /templates/upload_attachment` with name `QA_Platform_{{stamp}}.exe`, data `UUE=`.
- **Expected.** HTTP 422, code 484 'File type not allowed'.
- **Oracle.** 422 code 484.
- **Trace.** P1 · automate · `EVD2-DOC-027` · `app/controllers/api/templates_controller.rb:63-65`

#### API-EVDDOC-028 — A GIF is refused by the server although the builder offers "any image"
- **Why it matters.** The builder's picker accepts any `image/*` file, the server only .jpg/.jpeg/.png among images; the buyer gets a generic failure (see UI-EVDDOC-085).
- **Setup.** QA buyer, no event.
- **Steps.** `POST /templates/upload_attachment` with name `QA_Platform_{{stamp}}.gif`, data `UUE=`.
- **Expected.** HTTP 422, code 484 'File type not allowed'.
- **Oracle.** 422 code 484.
- **Trace.** P2 · automate · `EVD2-DOC-028` · `app/controllers/concerns/utils.rb:746-749`

#### API-EVDDOC-029 — A failed store is reported as a failure here (unlike the event upload)
- **Why it matters.** The correct counterpart of API-EVDDOC-016: this endpoint checks the storage result.
- **Setup.** QA buyer, no event. Nothing is stored.
- **Steps.** `POST /templates/upload_attachment` with name `QA_Platform_{{stamp}}.png` and data `12345`.
- **Expected.** Refused. HTTP 422, code 902, message 'Upload failed' (code 902's catalogue text is 'Only active or paused jobs can be cancelled'; the code is reused with a custom message).
- **Oracle.** 422 code 902.
- **Trace.** P2 · automate · `EVD2-DOC-029` · `app/controllers/api/templates_controller.rb:66-70`

#### API-EVDDOC-030 — A name longer than the storage key limit fails cleanly
- **Why it matters.** No name-length guard; storage refuses keys over 1,024 bytes and the user sees only "Upload failed".
- **Setup.** QA buyer, no event. Nothing is stored.
- **Steps.** `POST /templates/upload_attachment` with data `UUE=` and a 1,100-character name ending `.png`.
- **Expected.** HTTP 422, code 902, message 'Upload failed'; not a 500.
- **Oracle.** 422 code 902.
- **Trace.** P2 · automate · `EVD2-DOC-030` · `app/controllers/api/templates_controller.rb:66-70` · `app/controllers/concerns/s3_upload.rb:83-101`

#### API-EVDDOC-031 — The template image upload has no permission check at all
- **Why it matters.** Every other upload asks the policy; this action never calls `authorize`, so any signed-in console user can store files in the company's template folder.
- **Setup.** A console user without template create/edit rights. Manual (needs that user).
- **Steps.** As that user, `POST /templates/upload_attachment` with a small PNG.
- **Expected (today).** HTTP 200 `{url: …}`. Should be 455 for users who cannot edit templates.
- **Oracle.** 200 for a user who gets 455 on `POST /templates`.
- **Trace.** P2 · manual · `app/controllers/api/templates_controller.rb:57-77`

#### API-EVDDOC-032 — The vendor app may not call the template image upload
- **Why it matters.** Records the app rule; a vendor session sending it is answered 401 and signed out.
- **Setup.** Never run automatically: the 401 ends the vendor's session.
- **Steps.** From the vendor app, `POST /templates/upload_attachment`.
- **Expected.** HTTP 401 'app not authorized' (agribid_website has no templates#upload_attachment entry).
- **Oracle.** 401 and the vendor session ends.
- **Trace.** P2 · manual · `config/app_auth_config.yml` · `app/controllers/concerns/api_auth.rb:78-105`

#### API-EVDDOC-033 — The image link saved in a template question can expire after two hours
- **Why it matters.** The reply carries only a signed link (no private storage link) and the builder saves that link into the question; the round reader treats a CDN-signed link as a user link and never re-signs it.
- **Setup.** A template with an image question; company uses CDN signing (`USE_CLOUDFRONT_SIGNING` not 'false'). Manual (needs time).
- **Steps.** 1. Upload an image in the RFI builder and save the question. 2. Open the round as a vendor more than 2 hours later.
- **Expected (today).** The image fails to load (expired signature). Should store the private link and sign on every read.
- **Oracle.** The stored `fileUrl` is a signed link; after 7200 s it answers 403.
- **Trace.** P1 · manual · `app/controllers/api/templates_controller.rb:66-73` · `app/serializers/trade_template_serializer.rb:1131-1137` · `app/models/concerns/aws_url_helper.rb:84-104`

## 3. Opening a stored file by link — `GET /v1/attachments/open`

This action skips sign-in and app checks (`skip_before_action … :authorize_app …`); the encrypted token is its only
lock, so it is safe to call from any session. It rescues only `InvalidSignature` and `ArgumentError`.

#### API-EVDDOC-034 — A link with no token must not crash
- **Why it matters.** A truncated link from an email or a report PDF must give a clean message.
- **Setup.** No event.
- **Steps.** `GET /v1/attachments/open`.
- **Expected (today).** Should be 422 'Invalid token'. Today decoding `nil` calls `nil.end_with?` → NoMethodError, not rescued → HTTP 500.
- **Oracle.** Any non-5xx passes; a 500 is the defect.
- **Trace.** P1 · automate · `EVD2-DOC-034` · `app/controllers/api/v1/attachments_controller.rb:12-18`

#### API-EVDDOC-035 — An empty token is refused
- **Why it matters.** Baseline refusal for a cut-off link.
- **Setup.** No event.
- **Steps.** `GET /v1/attachments/open?token=`.
- **Expected.** HTTP 422, plain text 'Invalid token'; no redirect.
- **Oracle.** 422.
- **Trace.** P2 · automate · `EVD2-DOC-035` · `app/controllers/api/v1/attachments_controller.rb:14-17`

#### API-EVDDOC-036 — A token that is not base64 is refused
- **Why it matters.** Garbage must be refused, not crash.
- **Setup.** No event.
- **Steps.** `GET /v1/attachments/open?token=!!!!`.
- **Expected.** HTTP 422, plain text 'Invalid token' (strict decoding raises ArgumentError, which is rescued).
- **Oracle.** 422.
- **Trace.** P2 · automate · `EVD2-DOC-036` · `app/controllers/api/v1/attachments_controller.rb:14-17`

#### API-EVDDOC-037 — A well-formed but fake token is refused
- **Why it matters.** The token is the only lock; anything that is not a genuine token must be refused cleanly.
- **Setup.** No event.
- **Steps.** `GET /v1/attachments/open?token=UUFfUGxhdGZvcm0` (base64 of "QA_Platform").
- **Expected.** HTTP 422, plain text 'Invalid token'. The app sets no `load_defaults`, so the encryptor is AES-256-CBC with a signature check that raises InvalidSignature (rescued). A 500 would mean an authenticated cipher or a missing secret — neither is rescued, so that too is a defect.
- **Oracle.** 422, never a redirect, never 500.
- **Trace.** P1 · automate · `EVD2-DOC-037` · `app/controllers/api/v1/attachments_controller.rb:12-18` · `lib/encrypt_decrypt.rb:79-83`

#### API-EVDDOC-038 — A token with a made-up signature is refused
- **Why it matters.** Confirms a hand-built "message--signature" never opens a file.
- **Setup.** No event.
- **Steps.** `GET /v1/attachments/open?token=UUFfUGxhdGZvcm0tLTAwMDA` (base64 of "QA_Platform--0000").
- **Expected.** HTTP 422, plain text 'Invalid token'.
- **Oracle.** 422, no `Location` header.
- **Trace.** P1 · automate · `EVD2-DOC-038` · `app/controllers/api/v1/attachments_controller.rb:12-18` · `lib/encrypt_decrypt.rb:85-91`

#### API-EVDDOC-039 — A token sent as a list must not crash
- **Why it matters.** Unauthenticated endpoints are the first thing scanners probe.
- **Setup.** No event.
- **Steps.** `GET /v1/attachments/open?token[]=QA`.
- **Expected (today).** Should be 422 'Invalid token'. Today the token is an Array, `Array#end_with?` does not exist → NoMethodError (not rescued) → HTTP 500.
- **Oracle.** Any non-5xx passes; a 500 is the defect.
- **Trace.** P2 · automate · `EVD2-DOC-039` · `app/controllers/api/v1/attachments_controller.rb:14-16`

#### API-EVDDOC-040 — A file link never expires and cannot be revoked
- **Why it matters.** Tokens are encrypted without an expiry and the endpoint needs no sign-in, so a forwarded link opens the file indefinitely, even after the event is withdrawn or the user leaves.
- **Setup.** Company with `attachment_token_url_enabled` ON; a round with a T&C file. Manual.
- **Steps.** 1. As a vendor, copy the T&C link (…/api/v1/attachments/open?token=…). 2. Months later, in a fresh window with no session, open it.
- **Expected (today).** 302 to a fresh signed link — the file opens. Should carry an expiry or check access.
- **Oracle.** The old link still redirects to the file.
- **Trace.** P1 · manual · `lib/encrypt_decrypt.rb:85-97` · `app/controllers/api/v1/attachments_controller.rb:5-15`

#### API-EVDDOC-041 — With no token secret configured every file link is a 500
- **Why it matters.** `attachment_encryptor` returns nil when `ATTACHMENT_TOKEN_SECRET` is blank and `open` calls `nil.decrypt_and_verify` unguarded, so all report links break at once.
- **Setup.** An environment where the ProcolVariable `ATTACHMENT_TOKEN_SECRET` is empty. Manual (configuration).
- **Steps.** Open any `/api/v1/attachments/open?token=…` link.
- **Expected (today).** HTTP 500. Should be a clean refusal and fall back to a signed URL (the link builders already fall back when the secret is missing).
- **Oracle.** 500 vs a readable refusal.
- **Trace.** P2 · manual · `lib/encrypt_decrypt.rb:79-83` · `app/controllers/api/v1/attachments_controller.rb:13-14`

#### API-EVDDOC-042 — Whether a vendor gets a lasting link depends on the vendor's company
- **Why it matters.** The round reader reads `attachment_token_url_enabled` on `Current.workspace`, which for a vendor is the vendor's own company; a buyer who turns it on still sends 2-hour links to vendors whose company does not have it.
- **Setup.** Buyer company ON, QA vendor company OFF; a round with a T&C file. Manual (config).
- **Steps.** Read the round as the buyer and as the vendor; compare `attachments[*].value[*].public_url`.
- **Expected (today).** Buyer sees a token link, vendor sees a 2-hour signed link. Should follow the event owner's setting.
- **Oracle.** Different link kinds for the same file.
- **Trace.** P2 · manual · `app/serializers/trade_template_serializer.rb:881-902` · `app/models/company.rb:308-310`

## 4. Event-level attachments and the company-folder check — `PATCH /event_groups/:id`

The check (`validate_company_urls`) reads only `attachment["url"]` / `attachment["public_url"]`, acts only when the text
contains `amazonaws.com/trade_files/`, and treats any URL its company-id pattern does not match as allowed. The reader
then signs the PATH of the URL as a key in Procol's own bucket (and URL-decodes it first), whatever the host.
EDGE-PUB-023/024/025 already cover a text `attachments`, the plain other-company URL and a `javascript:` URL; the cases
below record spellings that skip the check. All use the made-up folder `QA_Platform_999999999`, which does not exist.

#### API-EVDDOC-043 — A percent-encoded folder name skips the company check
- **Why it matters.** The tenant-isolation check keys off literal text, so the same path spelled differently is not inspected.
- **Setup.** The run's own draft event with one RFQ round (QA vendor 1 in the audience). Publishing notifies QA vendor 1 only.
- **Steps.** Publish (`PATCH /event_groups/{{eventGroupUuid}}` with the publish body) with `attachments: [{"url": "https://procol.s3.amazonaws.com/trade%5Ffiles/terms_and_conditions/QA_Platform_999999999/QA_Platform_{{stamp}}.pdf", "name": "QA_Platform_{{stamp}}.pdf"}]`.
- **Expected (today).** Should be refused like the plain spelling (EDGE-PUB-024): HTTP 422, code 101 'You are not allowed to perform this action'. Today the literal test misses `trade%5Ffiles`, so the event publishes (200) and the reader decodes the key back to `trade_files/…`.
- **Oracle.** 422 code 101 passes; a 200 is the defect.
- **Trace.** P1 · automate · `EVD2-DOC-043` · `app/controllers/concerns/s3_url_validator.rb:25-33` · `app/models/concerns/aws_url_helper.rb:59-82`

#### API-EVDDOC-044 — A URL on a different host is signed as a Procol file
- **Why it matters.** Signing ignores the host and uses the URL's path as a bucket key, so a URL on any host is treated as a Procol object; the check never looks at a non-S3 host.
- **Setup.** The run's own draft event with one RFQ round.
- **Steps.** Publish with `attachments: [{"url": "https://files.example.com/trade_files/terms_and_conditions/QA_Platform_999999999/QA_Platform_{{stamp}}.pdf", "name": "QA_Platform_{{stamp}}.pdf"}]`.
- **Expected (today).** Should be refused: HTTP 422, code 101. Today it publishes (200); the check only inspects URLs containing `amazonaws.com/trade_files/`, and the reader signs the path regardless of host. The check should judge the path, not the host string.
- **Oracle.** 422 code 101 passes; a 200 is the defect.
- **Trace.** P1 · automate · `EVD2-DOC-044` · `app/controllers/concerns/s3_url_validator.rb:26` · `app/models/concerns/aws_url_helper.rb:59-82` · `app/models/event_group.rb:329-338`

#### API-EVDDOC-045 — An encoded slash defeats the company-id pattern
- **Why it matters.** "No match" is treated as "allowed", so an encoded separator makes the pattern miss and the value pass.
- **Setup.** The run's own draft event with one RFQ round.
- **Steps.** Publish with `attachments: [{"url": "https://procol.s3.amazonaws.com/trade_files/terms_and_conditions%2FQA_Platform_999999999/QA_Platform_{{stamp}}.pdf", "name": "QA_Platform_{{stamp}}.pdf"}]`.
- **Expected (today).** Should be refused: HTTP 422, code 101. Today the `/trade_files/<folder>/<name>_<id>/` pattern does not match when the slash is encoded, a non-match is allowed, and the event publishes (200); the signer later decodes `%2F`.
- **Oracle.** 422 code 101 passes; a 200 is the defect.
- **Trace.** P1 · automate · `EVD2-DOC-045` · `app/controllers/concerns/s3_url_validator.rb:28-29` · `app/models/concerns/aws_url_helper.rb:73`

#### API-EVDDOC-046 — Attachments sent as plain links break the event page
- **Why it matters.** The reader assumes each attachment is an object; a plain-text item makes every read of the event fail.
- **Setup.** The run's own draft event with one RFQ round.
- **Steps.** 1. Publish with `attachments: ["https://files.example.com/QA_Platform_{{stamp}}.pdf"]` (text, not objects). 2. Read the event back as the buyer.
- **Expected (today).** Should be refused (422: each attachment must be an object with a url). Today the check skips text items, the list is saved, and building the reply calls `['public_url'] = …` on a String → IndexError → HTTP 500; every later GET of the event then fails the same way for buyer and vendors.
- **Oracle.** The verify read-back of the event must answer 2xx; a 500 is the defect.
- **Trace.** P0 · automate · `EVD2-DOC-046` · `app/controllers/api/event_groups_controller.rb:1745-1758` · `app/models/event_group.rb:329-338` · `app/services/event_groups/update_service.rb:244`

#### API-EVDDOC-047 — A draft event accepts a foreign-folder attachment (the check runs on publish and edit)
- **Why it matters.** The check runs on every `PATCH /event_groups/:id`, including a draft save, so it should refuse the foreign folder before publish too.
- **Setup.** A draft event with one line item. Manual: the plan runner's draft save path is not exercised as a decisive twin here; confirm on a fresh draft.
- **Steps.** `PATCH /event_groups/<draft uuid>` with status `draft` and `attachments: [{"url": "https://procol.s3.amazonaws.com/trade_files/terms_and_conditions/QA_Platform_999999999/QA_Platform_x.pdf"}]`.
- **Expected.** HTTP 422, code 101 (the plain other-company URL is caught before the draft is saved).
- **Oracle.** 422 code 101; attachments unchanged.
- **Trace.** P2 · manual · `app/controllers/api/event_groups_controller.rb:70-78`

#### API-EVDDOC-048 — The company check never runs on a line-item (product) attachment
- **Why it matters.** The publish check reads only the top-level `attachments`; a file attached to a line item (`creator_attachment`) is signed on read with no folder check.
- **Setup.** A published event whose line item carries a `creator_attachment`. Manual (needs the round's trade-product ids).
- **Steps.** Publish or edit with a line item whose `creator_attachment` holds another company's `trade_files` URL, then read the round.
- **Expected (today).** Should be 101 like a top-level attachment. Today the value is stored and signed for readers (`append_signed_url_to_objects`), the folder check never sees it.
- **Oracle.** The foreign URL comes back signed in the round's line data.
- **Trace.** P1 · manual · `app/controllers/concerns/trade_template_helper.rb:6388-6403,1471` · `app/controllers/api/event_groups_controller.rb:76-78`

## 5. Round terms-and-conditions files — `PATCH /trade/:id`

The round-edit endpoint selects T&C files with `params["attachments"].select { |a| a["type"] == "t_and_c" }` at the top
and stores them in `misc["attachments"]`; the round reader (`TradeTemplateSerializer#attachments`) walks each
`attachment["value"]` and signs each `private_url`, treating any non-Procol-bucket URL as a pass-through link. The trade
controller does not include `S3UrlValidator`, so the company-folder check never runs on a round.

#### API-EVDDOC-049 — A round T&C file from another company's folder is accepted
- **Why it matters.** The event-level check exists for exactly this; the round endpoint lacks it.
- **Setup.** The run's own live RFQ round, QA vendor 1 invited, no bids. Saving terms notifies invited vendors (QA vendor 1 only).
- **Steps.** `PATCH /trade/{{tradeId}}` with `terms_and_conditions: ["QA_Platform_tnc_{{stamp}}"]` and one `t_and_c` attachment whose `private_url` is `https://procol.s3.amazonaws.com/trade_files/terms_and_conditions/QA_Platform_999999999/QA_Platform_{{stamp}}.pdf`.
- **Expected (today).** Should be refused (422 code 101) like EDGE-PUB-024. Today: HTTP 200 and the link is stored; the trade controller runs no company-URL check, and for a real bucket URL the reader signs it for every invited vendor.
- **Oracle.** 422 code 101 passes; a 200 is the defect.
- **Trace.** P1 · automate · `EVD2-DOC-049` · `app/controllers/api/trade_controller.rb:459,714-722` · `app/serializers/trade_template_serializer.rb:881-898`

#### API-EVDDOC-050 — A javascript: T&C link is served back to the vendor
- **Why it matters.** A clickable `javascript:` link on every invited vendor's T&C list is a stored-script risk.
- **Setup.** The run's own live RFQ round, QA vendor 1 invited.
- **Steps.** 1. `PATCH /trade/{{tradeId}}` with `terms_and_conditions: ["QA_Platform_tnc_{{stamp}}"]` and one `t_and_c` attachment whose `private_url` is `javascript:alert(document.domain)`. 2. Read the round as QA vendor 1.
- **Expected (today).** Should be refused (only Procol-stored files or http/https links). Today the update is accepted and the vendor's copy returns the link unchanged as `public_url` — a non-bucket URL counts as a "user link" and is passed through.
- **Oracle.** The verify read-back as the vendor asserts `attachments[*].value[*].public_url` is not the javascript: value; today it is, so the case fails (defect confirmed).
- **Trace.** P1 · automate · `EVD2-DOC-050` · `app/controllers/concerns/utils.rb:998-1001` · `app/serializers/trade_template_serializer.rb:881-898` · `app/controllers/api/trade_controller.rb:714-722`

#### API-EVDDOC-051 — A T&C attachment with a text value makes the round page unreadable
- **Why it matters.** The reader assumes `value` is a list; a text value makes every read of the round fail for buyer and vendors.
- **Setup.** The run's own live RFQ round, no bids.
- **Steps.** 1. `PATCH /trade/{{tradeId}}` with `attachments: [{type: t_and_c, value: "QA_Platform_{{stamp}}.pdf"}]` (value as text). 2. Read the round as the buyer and as QA vendor 1.
- **Expected (today).** The update answers 200 (its reply omits attachments). Should be refused (422). Today the value is saved and every later read calls `value.each` on a String → NoMethodError → HTTP 500 for everyone.
- **Oracle.** Both verify read-backs must answer 2xx; a 500 is the defect.
- **Trace.** P0 · automate · `EVD2-DOC-051` · `app/serializers/trade_template_serializer.rb:881-898` · `app/controllers/api/trade_controller.rb:459,714-722`

#### API-EVDDOC-052 — A T&C attachment with no value makes the round page unreadable
- **Why it matters.** A client that drops an empty list must not poison the round.
- **Setup.** The run's own live RFQ round, no bids.
- **Steps.** 1. `PATCH /trade/{{tradeId}}` with `attachments: [{type: t_and_c}]` (no value). 2. Read the round as the buyer.
- **Expected (today).** Should be refused or treated as empty. Today it is saved and every later read calls `nil.each` → HTTP 500.
- **Oracle.** The verify read-back must answer 2xx; a 500 is the defect.
- **Trace.** P1 · automate · `EVD2-DOC-052` · `app/serializers/trade_template_serializer.rb:881-898` · `app/controllers/api/trade_controller.rb:714-722`

#### API-EVDDOC-053 — Editing only the T&C files wipes the written terms
- **Why it matters.** Adding a file to the terms must not erase the terms themselves.
- **Setup.** The run's own live RFQ round. Arrange step sets one written clause first.
- **Steps.** 1. Set the round's T&C to the clause `QA_Platform_tnc_keep`. 2. `PATCH /trade/{{tradeId}}` with ONLY `attachments` (one `t_and_c` file), no `terms_and_conditions`. 3. Read the round back.
- **Expected (today).** The update is accepted (200). The clause should still be there. Today this branch rebuilds the terms from `Array(nil) = []`, so changing only the files deletes every written clause.
- **Oracle.** The verify asserts the round's `terms_and_conditions` still contains `QA_Platform_tnc_keep`; today it does not, so the case fails (defect confirmed).
- **Trace.** P1 · automate · `EVD2-DOC-053` · `app/controllers/api/trade_controller.rb:714-722` · `app/services/terms_and_conditions/persisted_array_builder.rb:8-33`

#### API-EVDDOC-054 — Attachments as text crash the round-edit endpoint
- **Why it matters.** The line that picks T&C files runs for every round update (extension, title, settings), so any of them crashes when `attachments` is text.
- **Setup.** The run's own live RFQ round, no bids.
- **Steps.** `PATCH /trade/{{tradeId}}` with `attachments: "QA_Platform_{{stamp}}.pdf"`.
- **Expected (today).** Should be 422. Today `.select` on the text → NoMethodError → HTTP 500, before anything is saved.
- **Oracle.** Any non-5xx passes; a 500 is the defect.
- **Trace.** P1 · automate · `EVD2-DOC-054` · `app/controllers/api/trade_controller.rb:459`

#### API-EVDDOC-055 — A number inside the attachments list crashes the round-edit endpoint
- **Why it matters.** Same unguarded line, a different shape.
- **Setup.** The run's own live RFQ round, no bids.
- **Steps.** `PATCH /trade/{{tradeId}}` with `attachments: [1]`.
- **Expected (today).** Should be 422. Today `1["type"]` raises TypeError → HTTP 500, before anything is saved.
- **Oracle.** Any non-5xx passes; a 500 is the defect.
- **Trace.** P2 · automate · `EVD2-DOC-055` · `app/controllers/api/trade_controller.rb:459`

#### API-EVDDOC-056 — T&C files are locked once bidding has closed with a bid in
- **Why it matters.** Changing the terms after vendors have bid against them would change the deal after the fact.
- **Setup.** The run's own RFQ round: QA vendor 1 has bid and the bid window plus extra closing time is over.
- **Steps.** `PATCH /trade/{{tradeId}}` with `terms_and_conditions: ["QA_Platform_tnc_{{stamp}}"]` and `attachments: [{type: t_and_c, value: []}]`.
- **Expected.** HTTP 422, code 4 'Request not found' — terms and files cannot change once a bid exists and the window is over; a closed round is refused with the same code 4. Nothing changes.
- **Oracle.** 422 code 4.
- **Trace.** P2 · automate · `EVD2-DOC-056` · `app/controllers/api/trade_controller.rb:594,714-717`

## 6. Files carried on remarks (withdrawal, surrogate reference)

A `Remark` has an `attachments` string-array column with two validations: at most 10 entries, and every entry must be a
Procol-bucket URL (`Utils.is_link_given_by_user` false). The validation runs `value.any?`, which assumes a list.

#### API-EVDDOC-058 — Withdrawing without a files list crashes
- **Why it matters.** A client that omits the empty `attachments` list cannot withdraw an event at all.
- **Setup.** The run's own live event (one RFQ round, QA vendor 1 invited, no bids). A successful withdrawal notifies QA vendor 1 only.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}` with status `withdrawn` and `withdraw_remark: {remarks: "QA_Platform_withdraw_{{stamp}}"}` — no `attachments` key.
- **Expected (today).** Should withdraw (no files is valid) or refuse 422. Today the remark is built with `attachments = nil` and the validation calls `nil.any?` → NoMethodError → HTTP 500; the event stays live.
- **Oracle.** Any non-5xx passes; a 500 is the defect.
- **Trace.** P1 · automate · `EVD2-DOC-058` · `app/models/remark.rb:28-38` · `app/helpers/api/remarks_helper.rb:4-14` · `app/services/event_groups/update_service.rb:348-354`

#### API-EVDDOC-059 — A withdrawal-notice file on an outside host is refused and the event stays live
- **Why it matters.** The remark's file check is the only thing stopping outside links on a withdrawal notice, and it must leave the event untouched when it fires.
- **Setup.** The run's own live event with one RFQ round.
- **Steps.** 1. `PATCH /event_groups/{{eventGroupUuid}}` with status `withdrawn` and `withdraw_remark: {remarks, attachments: ["https://files.example.com/QA_Platform_{{stamp}}.pdf"]}`. 2. Read the event back.
- **Expected.** HTTP 422, code 472 'failed to add remark' — a remark only accepts Procol-bucket files. The remark is written first, so nothing else changes: the event is still active.
- **Oracle.** 422 code 472; the verify read-back shows `status: active`.
- **Trace.** P1 · automate · `EVD2-DOC-059` · `app/models/remark.rb:28-38` · `app/services/event_groups/update_service.rb:316-354` · `app/controllers/concerns/event_group_controller_helper.rb:28-38`

#### API-EVDDOC-060 — Withdrawal-notice files sent as text must not crash
- **Why it matters.** Type confusion on the most consequential lifecycle action.
- **Setup.** The run's own live event with one RFQ round.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}` with status `withdrawn` and `withdraw_remark: {remarks, attachments: "QA_Platform_{{stamp}}.pdf"}` (text, not a list).
- **Expected (today).** Should be refused (422). The text is cast into the text-array column; depending on the adapter the remark either fails validation (472) or the validation meets a non-list (500). Must not be a 500.
- **Oracle.** Any non-5xx passes; a 500 is the defect.
- **Trace.** P2 · automate · `EVD2-DOC-060` · `app/models/remark.rb:28-38` · `app/helpers/api/remarks_helper.rb:4-14`

#### API-EVDDOC-061 — A surrogate-bid reference note without a files list crashes after the bid is saved
- **Why it matters.** A half-done surrogate bid behind a server error invites a second, duplicate entry.
- **Setup.** The run's own live RFQ round, QA vendor 1 invited, no bids; the company allows surrogate (on-behalf) bids. The bid is entered for QA vendor 1.
- **Steps.** Enter a surrogate bid for QA vendor 1 with `surrogate_remarks: {remarks: "QA_Platform_ref_{{stamp}}"}` and no `attachments` key.
- **Expected (today).** Should be accepted (a note without files) or refused 422. Today the bid is saved first, then the reference remark is built with `attachments = nil` and its validation calls `nil.any?` → HTTP 500 — the buyer sees an error although the bid now exists.
- **Oracle.** Any non-5xx passes; a 500 is the defect. Depends on surrogate bidding being allowed for the company.
- **Trace.** P1 · automate · `EVD2-DOC-061` · `app/controllers/concerns/bids_controller_helper.rb:633-643` · `app/controllers/api/bids_controller.rb:654-662` · `app/models/remark.rb:28-38`

#### API-EVDDOC-062 — A surrogate reference note with an outside-host file leaves a saved bid behind a server error
- **Why it matters.** The `# ! POTENTIAL RENDERING ISSUE` comment in the code is real: an invalid file link leaves a saved bid behind a 500.
- **Setup.** As EVD2-DOC-061; the company allows surrogate bids.
- **Steps.** Enter a surrogate bid for QA vendor 1 with `surrogate_remarks: {remarks: "QA_Platform_ref_{{stamp}}", attachments: ["https://files.example.com/QA_Platform_{{stamp}}.pdf"]}`.
- **Expected (today).** Should be refused with 422 code 472 and no bid saved. Today the bid is saved, the remark fails validation, the helper renders 472 and returns nil, and the caller proceeds with a nil bid → HTTP 500 with the bid already stored.
- **Oracle.** Any non-5xx passes; a 500 is the defect. Depends on surrogate bidding being allowed.
- **Trace.** P1 · automate · `EVD2-DOC-062` · `app/controllers/concerns/bids_controller_helper.rb:633-643` · `app/controllers/api/bids_controller.rb:660-666`

#### API-EVDDOC-063 — More than ten files on a remark are refused
- **Why it matters.** The Remark model caps attachments at 10.
- **Setup.** The run's own live event. Manual: needs 11 real Procol-bucket URLs, which the runner cannot mint.
- **Steps.** Withdraw with a `withdraw_remark` carrying 11 valid bucket file URLs.
- **Expected.** HTTP 422, code 472 'failed to add remark' (length validation 0..10).
- **Oracle.** 472; the event stays live.
- **Trace.** P2 · manual · `app/models/remark.rb:33`

#### API-EVDDOC-064 — A counter-offer remark file on an outside host is refused
- **Why it matters.** Counter-offer (`raise_additional_request`) remarks go through the same `create_remarks_helper`, so the same file rule applies, and the same "renders after save" pattern exists.
- **Setup.** A live RFQ with a submitted bid; a real counter-offer body for the line. Manual (needs the round's trade-product ids to build a valid counter-offer row).
- **Steps.** `POST /additional_request/raise_additional_request` for the bid with `attachments: ["https://files.example.com/QA_Platform_x.pdf"]`.
- **Expected.** HTTP 422, code 472; no counter offer saved. (If the request is saved first and then renders the error, that is the same defect pattern as EVD2-DOC-062.)
- **Oracle.** 472; the bid is still active, not `requested`.
- **Trace.** P1 · manual · `app/helpers/api/additional_requests_helper.rb:164-165,287-296,418-430`

## 7. The event Reports list — `GET /event_groups/:id/get_all_attachments`

This endpoint builds the "Reports" panel: per-stage report names (RFQ/Auction/Technical report plus a counter-offer
report for each commercial stage) and event-level reports (master QCS, approval note, communication log). It looks the
event up with `EventGroup.find` (RecordNotFound → 404), returns nothing for a draft, then authorizes `:show?`. Goes
deeper than the lot case already covered by API-XDLOT-008.

#### API-EVDDOC-067 — The reports list for an unknown event is not found
- **Why it matters.** An unknown id must be a clean not-found.
- **Setup.** QA buyer; no event.
- **Steps.** `GET /event_groups/Z2dnWmdaUWtnZw==/get_all_attachments` (id decodes to one that does not exist).
- **Expected.** HTTP 404 — `EventGroup.find` raises RecordNotFound (the blank check after it never runs).
- **Oracle.** 404.
- **Trace.** P2 · automate · `EVD2-DOC-067` · `app/controllers/api/event_groups_controller.rb:686-689`

#### API-EVDDOC-068 — A garbled event id is not found
- **Why it matters.** A garbled id must not crash.
- **Setup.** QA buyer; no event.
- **Steps.** `GET /event_groups/WrongUuid1=/get_all_attachments` (decodes to nil).
- **Expected.** HTTP 404 — the id decodes to nil and `EventGroup.find(nil)` raises RecordNotFound.
- **Oracle.** 404.
- **Trace.** P2 · automate · `EVD2-DOC-068` · `app/controllers/api/event_groups_controller.rb:686-689` · `app/controllers/concerns/params_auth.rb:57-67`

#### API-EVDDOC-069 — The reports list for a draft event is empty with no body
- **Why it matters.** Records the odd draft contract so a future change is noticed.
- **Setup.** The run's own draft event (one line item, no rounds), read by its owner.
- **Steps.** `GET /event_groups/{{eventGroupUuid}}/get_all_attachments`.
- **Expected (today).** HTTP 204 No Content with an empty body — the action returns before rendering when the event is a draft, so Rails answers "no content". Clients expecting `{data: []}` must cope with an empty body. Must not be a 500.
- **Oracle.** Any non-5xx passes.
- **Trace.** P2 · automate · `EVD2-DOC-069` · `app/controllers/api/event_groups_controller.rb:690`

#### API-EVDDOC-070 — A live event lists its stage reports
- **Why it matters.** The Reports panel of the event page is built from this list.
- **Setup.** The run's own live RFQ event, no bids, read by its owner.
- **Steps.** `GET /event_groups/{{eventGroupUuid}}/get_all_attachments`.
- **Expected.** HTTP 200 `{data: […]}` with, for the RFQ round, 'RFQ report' (auction_bids_comparison_report) and 'RFQ Counter Offer Report' (counter_offer_report_v2), each with the round uuid and item_type trade_request. No QCS-Purchase yet (needs a participating vendor) and no Approval Note (no selected proposal).
- **Oracle.** 200; `data` is a non-empty list including 'RFQ report'.
- **Trace.** P1 · automate · `EVD2-DOC-070` · `app/controllers/api/event_groups_controller.rb:686-725,1153-1183,1268-1274`

#### API-EVDDOC-071 — The reports list is returned to an invited vendor
- **Why it matters.** Vendors should not even learn that a comparison or award note exists; `show?` only checks that one round is visible.
- **Setup.** The run's own live RFQ event; QA vendor 1 invited and has bid. Read by QA vendor 1 (vendor app).
- **Steps.** As QA vendor 1, `GET /event_groups/{{eventGroupUuid}}/get_all_attachments`.
- **Expected (today).** HTTP 200 and the vendor receives the buyer's report menu for rounds it can see — 'RFQ report', 'RFQ Counter Offer Report' and, once a vendor participates, 'QCS-Purchase', plus 'Approval Note-Purch' once a proposal is selected. Whether each report then downloads for a vendor is decided elsewhere and must be checked manually.
- **Oracle.** 200; `data` includes names beyond the vendor's own.
- **Trace.** P2 · automate · `EVD2-DOC-071` · `app/controllers/api/event_groups_controller.rb:686-725,1185-1265` · `app/policies/event_group_policy.rb:52-54`

#### API-EVDDOC-072 — The reports list is refused for an uninvited vendor
- **Why it matters.** The report menu must not leak to vendors outside the event.
- **Setup.** The run's own live RFQ event with QA vendor 1 invited; read by QA vendor 2, who is NOT invited.
- **Steps.** As QA vendor 2, `GET /event_groups/{{eventGroupUuid}}/get_all_attachments`.
- **Expected.** HTTP 422, code 455 'You are not authorized to perform this action' — `show?` needs at least one round visible to the caller; a restricted round hides it from an uninvited vendor.
- **Oracle.** 422 code 455. Depends on the round being restricted to its invited vendors.
- **Trace.** P1 · automate · `EVD2-DOC-072` · `app/controllers/api/event_groups_controller.rb:691` · `app/policies/event_group_policy.rb:52-54` · `app/models/event_group.rb:511-526`

#### API-EVDDOC-073 — The reports list still answers after a withdrawal
- **Why it matters.** Buyers need the paper trail of a withdrawn event.
- **Setup.** The run's own live RFQ event, withdrawn by the buyer in the arrange step.
- **Steps.** 1. Withdraw the event with a remark. 2. `GET /event_groups/{{eventGroupUuid}}/get_all_attachments`.
- **Expected.** HTTP 200: a withdrawn event is not a draft, so the list is built; the withdrawn round still shows 'RFQ report' and 'RFQ Counter Offer Report' (stages are listed whatever their status).
- **Oracle.** 200; `data` includes 'RFQ report'.
- **Trace.** P2 · automate · `EVD2-DOC-073` · `app/controllers/api/event_groups_controller.rb:686-725` · `app/models/event_group.rb:511-526`

#### API-EVDDOC-074 — A master-QCS report appears only once a vendor is participating
- **Why it matters.** `should_include_master_qcs_report?` requires a live commercial stage with at least one participating vendor company.
- **Setup.** A live RFQ event where a vendor has submitted a bid vs one with no bids. Manual (the single-event twin in EVD2-DOC-071 covers the with-bid list; this contrasts the two states).
- **Steps.** Compare the list on a no-bid event and a with-bid event.
- **Expected.** No 'QCS-Purchase' until a vendor participates; present afterwards.
- **Oracle.** The entry appears only in the with-bid list.
- **Trace.** P2 · manual · `app/controllers/api/event_groups_controller.rb:1268-1274`

#### API-EVDDOC-075 — The approval-note report appears only after a proposal is selected
- **Why it matters.** `generate_event_group_report_names` adds the approval note only for a `selected` proposal.
- **Setup.** An awarded event (proposal selected) vs a live one. Manual (needs an awarded event).
- **Steps.** Compare the list before and after award.
- **Expected.** 'Approval Note-Purch' (proposal_report, item_type proposal) appears only after selection, carrying the proposal id.
- **Oracle.** The entry appears only after award.
- **Trace.** P2 · manual · `app/controllers/api/event_groups_controller.rb:1238-1250`

## 8. Screen behaviour (procol-client-dashboard)

#### UI-EVDDOC-081 — The attachment uploader enforces a 20 MB limit the server does not
- **Why it matters.** The only size limit a user meets lives in the screen; a different client has none (see API-EVDDOC-020).
- **Setup.** The event create / order screen's multiple-attachments control.
- **Steps.** Drag a file larger than 20 MB onto the uploader.
- **Expected.** The row shows "File size too large" and the file is not uploaded.
- **Oracle.** `MAX_FILE_SIZE = 20` and the `fileSize > MAX_FILE_SIZE * 1024 * 1024` guard.
- **Trace.** P2 · manual · `procol-client-dashboard/src/components/sheet/multipleAttachments.jsx:35,282-286`

#### UI-EVDDOC-082 — The uploader caps the count at 15 files
- **Why it matters.** The product limit on attachments per block.
- **Setup.** The multiple-attachments control with 15 files already added.
- **Steps.** Add a 16th file, or paste 16 links at once.
- **Expected.** "You can't upload more than 15 attachments"; the extra files/links are dropped.
- **Oracle.** `MAX_NO_OF_ATTACHMENTS = 15` and the two count guards.
- **Trace.** P2 · manual · `procol-client-dashboard/src/components/sheet/multipleAttachments.jsx:37-39,276-278,360-362`

#### UI-EVDDOC-083 — A URL pasted as a link is stored with no validation
- **Why it matters.** The "upload from URLs" path builds an attachment straight from the text, with no host or scheme check; it becomes the file's `url` and `publicUrl`.
- **Setup.** The multiple-attachments control.
- **Steps.** Paste `https://files.example.com/x.pdf` (or a `javascript:` string) into the URL box and add it.
- **Expected (today).** The link is added as a file with its name taken from the URL and no check. The server-side gap this feeds is API-EVDDOC-049/050.
- **Oracle.** The link object is pushed into `attachments` directly in `uploadLinks`.
- **Trace.** P1 · manual · `procol-client-dashboard/src/components/sheet/multipleAttachments.jsx:351-381`

#### UI-EVDDOC-084 — A failed upload surfaces the server's message
- **Why it matters.** The `catch` parses `err` as JSON and reads `error.message`; a non-JSON error throws inside the catch and the row shows nothing useful.
- **Setup.** The multiple-attachments control; force an upload failure (e.g. an unsupported type the server refuses with 484).
- **Steps.** Upload a `.exe`.
- **Expected.** The row shows the server message ("File type not allowed"); if the error body is not JSON the handler itself throws.
- **Oracle.** `JSON.parse(err).error.message` in the catch.
- **Trace.** P2 · manual · `procol-client-dashboard/src/components/sheet/multipleAttachments.jsx:340-347`

#### UI-EVDDOC-085 — The RFI builder's image picker accepts types the server refuses
- **Why it matters.** The picker allows any `image/*` plus a fixed list, so .gif/.webp/.bmp reach the server and come back "Upload failed" (API-EVDDOC-028) with no hint why.
- **Setup.** The RFI / technical template builder, a field with an image.
- **Steps.** Pick a `.gif`.
- **Expected (today).** The client accepts it (`file.type.startsWith("image/")`), uploads, and shows a generic "Upload failed!" from the 484.
- **Oracle.** `ACCEPTED_FILE_TYPES = "image/*,.pdf,.xls,.xlsx,.csv,.doc,.docx"` and `isValidFileType`.
- **Trace.** P2 · manual · `procol-client-dashboard/src/views/rfiBuilder/fieldCustomizer.jsx:36-44,145-147,160-209`

#### UI-EVDDOC-086 — The Reports panel is shown only when bulk report download is enabled
- **Why it matters.** The whole panel (and this endpoint call) is gated by a company setting.
- **Setup.** The event details page.
- **Steps.** Open an event in a company with `allow_bulk_report_download` off, then on.
- **Expected.** Off: no Reports panel, no `get_all_attachments` call. On: the panel loads the list.
- **Oracle.** `show_reports_table` from the event config drives `{showReportsTable && (<Panel …>)}`.
- **Trace.** P2 · manual · `procol-client-dashboard/src/views/projectDetails/projectDetails.jsx:241,970-985` · `app/controllers/concerns/event_group_controller_helper.rb:532,553`

#### UI-EVDDOC-087 — The Reports table filters by name and maps each row to a download
- **Why it matters.** The list's `name`, `item_type`, `report_category`, `report_type`, `item_uuid`, `lot_no` feed the download action; a missing field breaks that row's download.
- **Setup.** The Reports panel with several reports.
- **Steps.** Type in the search box; click Download on a row.
- **Expected.** The table filters case-insensitively by name; Download sends the mapped params to the report export.
- **Oracle.** `selectProjectReportsTableData` mapping and `handleDownloadReport`.
- **Trace.** P2 · manual · `procol-client-dashboard/src/views/projectDetails/components/reportsTable.jsx:47-64,88-94` · `procol-client-dashboard/src/redux/project/selectors.js:196-211`

#### UI-EVDDOC-088 — A draft event's empty Reports response must not break the panel
- **Why it matters.** The endpoint answers 204 with no body for a draft (API-EVDDOC-069); the selector must treat that as an empty list, not crash.
- **Setup.** A draft event with the Reports panel enabled.
- **Steps.** Open the panel on a draft.
- **Expected.** An empty table, no error; the count tag shows 0.
- **Oracle.** `selectProjectReportsTableData` returns `[]` when `reports.data` is not an array.
- **Trace.** P2 · manual · `procol-client-dashboard/src/redux/project/selectors.js:196-211` · `procol-client-dashboard/src/redux/project/slice.js:395-398`

#### UI-EVDDOC-089 — Event-level attachments round-trip through the create screen
- **Why it matters.** The create screen reads back `attachments` as `{name, url, publicUrl}`; a malformed stored attachment (API-EVDDOC-046) would break this map.
- **Setup.** An event with one event-level attachment, reopened for edit.
- **Steps.** Open the event in the create flow.
- **Expected.** The attachment shows with its name and links; T&C attachments are read from `terms_and_conditions.attachments` where `type === "t_and_c"` and `value` is a list.
- **Oracle.** The two `.map` blocks over `attachments` and `terms_and_conditions.attachments`.
- **Trace.** P2 · manual · `procol-client-dashboard/src/views/projectCreation/projectCreation.jsx:2150-2185`

## Coverage note

Automated twins (plan runner): uploads 001–018, event guard 043–046, round T&C 049–056, remark files 058–062, reports
067–073. Direct runner: template image 025–030, open-link 034–039. Everything else is manual for the reasons stated in
each Setup. Suspected defects are listed in the run report, not here.
