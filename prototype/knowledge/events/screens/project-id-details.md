# Screen: project-id-details (/project/a1FkY1Fa/details)

Captured 2026-11-03 on company 198678. 4 controls, 0 with a known effect, 5 test cases written from it.

## How to reach the project-id-details screen

Plan steps: open_create {"path":"erfx"} → set_title → compose_stages {"stages":["rfq"]} → expect_stages {"stages":["rfq"]} → select_template → add_line_items {"count":3} → expect_line_items {"count":3} → fill_sheet → set_schedule → invite_vendor. Path: `/project/a1FkY1Fa/details`.

## What each control on project-id-details does

## Test cases written from the project-id-details screen

- GEN-SCR-408: Start Clara awarding analysis. Steps: Click Ask Clara. Wait for the action to complete. Expected: The screen shows "Awarding initiated successfully, redirecting to awarding flow..." and navigates to the returned redirect_url. [plan: partial]
- GEN-SCR-409: Use the project link and copy controls. Steps: Open the Project link destination in the current tab. Return to the project details screen. Click Copy. Paste the clipboard value into a text area. Return to the project details screen. Click icon: copy. Paste the clipboard value into a text area. Expected: Project opens the destination defined by its link. Each copy control places its associated displayed project value on the clipboard, and the pasted value matches that displayed value. [plan: none]
- GEN-SCR-421: Ask Clara starts the awarding flow for an analyze_data task. Steps: Log in to Procol (buyer side) with the buyer user Open /project/UU5wY2Rk/details Click "Ask Clara" Expected: The message "Awarding initiated successfully, redirecting to awarding flow..." appears, and the browser navigates to /awarding/UU5wY2Rk. [plan: full]
- GEN-SCR-422: The copy control copies the displayed project ID. Steps: Log in to Procol (buyer side) with the buyer user Open /project/UU5wY2Rk/details Click "Copy" Paste the clipboard value into a plain-text editor Expected: The value copied by "Copy" is available in the editor. It is the project value associated with the control; record the exact copied value and any confirmation shown. [plan: none]
- GEN-SCR-423: Project opens its linked destination. Steps: Log in to Procol (buyer side) with the buyer user Open /project/UU5wY2Rk/details Click "Project" Expected: The linked Project destination opens in the current tab, the URL changes from /project/UU5wY2Rk/details, and the resulting page is displayed. Record the destination URL and page title. [plan: partial]
