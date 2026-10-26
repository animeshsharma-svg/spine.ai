# Screen: project-id-details (/project/ZGtwY2RO/details)

Captured 2026-10-26 on company 198678. 4 controls, 0 with a known effect, 2 test cases written from it.

## How to reach the project-id-details screen

Plan steps: open_create {"path":"erfx"} → set_title → compose_stages {"stages":["rfq"]} → expect_stages {"stages":["rfq"]} → select_template → add_line_items {"count":1} → fill_sheet → set_schedule → invite_vendor {"count":1} → compose_stages {"stages":["auction"]} → expect_stages {"stages":["auction"]} → select_template → expect_line_items {"count":1} → fill_sheet → set_schedule → invite_vendor {"count":1}. Path: `/project/ZGtwY2RO/details`.

## What each control on project-id-details does

## Test cases written from the project-id-details screen

- GEN-SCR-408: Start Clara awarding analysis. Steps: Click Ask Clara. Wait for the action to complete. Expected: The screen shows "Awarding initiated successfully, redirecting to awarding flow..." and navigates to the returned redirect_url. [plan: partial]
- GEN-SCR-409: Use the project link and copy controls. Steps: Open the Project link destination in the current tab. Return to the project details screen. Click Copy. Paste the clipboard value into a text area. Return to the project details screen. Click icon: copy. Paste the clipboard value into a text area. Expected: Project opens the destination defined by its link. Each copy control places its associated displayed project value on the clipboard, and the pasted value matches that displayed value. [plan: none]
