import { expect } from "@playwright/test";
import { UiFlowModule, gate } from "../master/types.js";
import { ClientConfig } from "../master/config.js";
import { BasePage } from "../pages/BasePage.js";
import { CONFIG, TIMEOUTS, NAV } from "../config.js";

/**
 * Config-gated navigate-and-assert flows across the PR / Approvals / Vendor
 * clusters. Each verifies that the UI a flag ships is actually present for
 * clients where the flag is ON (and skips-with-reason where OFF). Routes/labels
 * verified live on cpanel.ag-ri.in.
 */

const base = CONFIG.appUrl.replace(/\/$/, "");

async function nav(ctx: { page: import("@playwright/test").Page }, route: string): Promise<BasePage> {
  const p = new BasePage(ctx.page);
  await ctx.page.goto(base + route, NAV);
  await ctx.page.waitForLoadState("networkidle", { timeout: TIMEOUTS.LONG }).catch(() => {});
  await p.dismissDistractions();
  await ctx.page.waitForTimeout(1000);
  return p;
}

// has_user_approvals — the Approvals workspace with "Pending on me".
export const approvalsUserFlow: UiFlowModule = {
  key: "approval.user_approvals",
  category: "approvals",
  title: "Approvals workspace shows user approvals",
  covers: "nav /approvals → assert 'Pending on me' tab (has_user_approvals)",
  dependsOn: ["auth"],
  enabledFor: (c: ClientConfig) =>
    c.hasModule("approvals") && c.flag("has_user_approvals")
      ? gate(true, "approvals module + has_user_approvals")
      : gate(false, "approvals/has_user_approvals off"),
  async run(ctx) {
    const p = await nav(ctx, "/approvals");
    const tab = await p.find(
      [ctx.page.getByRole("tab", { name: /pending on me/i }), ctx.page.getByText(/pending on me/i)],
      { label: "pending-on-me", timeout: TIMEOUTS.MEDIUM },
    );
    expect(tab, "'Pending on me' approvals tab should be visible").toBeTruthy();
  },
};

// company_level_approval_workflows_allowed — company-wide approvals view.
export const approvalsCompanyFlow: UiFlowModule = {
  key: "approval.company_workflow",
  category: "approvals",
  title: "Company-level approvals view available",
  covers: "nav /approvals → assert 'All Approvals' tab (company_level_approval_workflows_allowed)",
  dependsOn: ["auth"],
  enabledFor: (c: ClientConfig) =>
    c.flag("company_level_approval_workflows_allowed")
      ? gate(true, "company_level_approval_workflows_allowed")
      : gate(false, "company_level_approval_workflows_allowed off"),
  async run(ctx) {
    const p = await nav(ctx, "/approvals");
    const tab = await p.find(
      [ctx.page.getByRole("tab", { name: /all approvals/i }), ctx.page.getByText(/all approvals/i)],
      { label: "all-approvals", timeout: TIMEOUTS.MEDIUM },
    );
    expect(tab, "'All Approvals' tab should be visible").toBeTruthy();
  },
};

// is_pr_reordering_enabled — PR list exposes the Reorder action.
export const prReorderFlow: UiFlowModule = {
  key: "pr.reorder_available",
  category: "pr",
  title: "PR list exposes Reorder",
  covers: "nav /purchase-requisitions → assert Reorder control (is_pr_reordering_enabled)",
  dependsOn: ["auth"],
  enabledFor: (c: ClientConfig) =>
    c.hasModule("pr") && c.flag("is_pr_reordering_enabled")
      ? gate(true, "pr module + is_pr_reordering_enabled")
      : gate(false, "pr reordering off"),
  async run(ctx) {
    const p = await nav(ctx, "/purchase-requisitions");
    const btn = await p.find(
      [ctx.page.getByRole("button", { name: /reorder/i }), ctx.page.getByText(/^reorder$/i)],
      { label: "pr-reorder", timeout: TIMEOUTS.MEDIUM },
    );
    expect(btn, "Reorder control should be present on the PR list").toBeTruthy();
  },
};

// pr module — PR list loads with its status tabs and PR rows.
export const prListFlow: UiFlowModule = {
  key: "pr.list",
  category: "pr",
  title: "Purchase requisitions list loads",
  covers: "nav /purchase-requisitions → assert Open tab + PR rows (pr module)",
  dependsOn: ["auth"],
  enabledFor: (c: ClientConfig) => (c.hasModule("pr") ? gate(true, "pr module") : gate(false, "no pr module")),
  async run(ctx) {
    const p = await nav(ctx, "/purchase-requisitions");
    const tab = await p.find(
      [ctx.page.getByRole("tab", { name: /^open/i }), ctx.page.getByText(/^open\b/i)],
      { label: "pr-open-tab", timeout: TIMEOUTS.MEDIUM },
    );
    expect(tab, "PR 'Open' tab should be visible").toBeTruthy();
    const anyPr = await p.find([ctx.page.getByRole("link", { name: /^PR-\d+/i })], { label: "pr-row", timeout: TIMEOUTS.MEDIUM });
    expect(anyPr, "at least one PR row should be present").toBeTruthy();
  },
};

// Vendor management workspace (invite + onboarding tabs).
export const vendorManagementFlow: UiFlowModule = {
  key: "vendor.management",
  category: "vendor",
  title: "Vendor management workspace available",
  covers: "nav /vendors → assert Invite Vendor + Vendors tab (vendor management)",
  dependsOn: ["auth"],
  enabledFor: (c: ClientConfig) =>
    c.flag("allow_update_vendor") || c.flag("can_skip_vendor_onboarding")
      ? gate(true, "vendor management flags present")
      : gate(false, "vendor management not enabled"),
  async run(ctx) {
    const p = await nav(ctx, "/vendors");
    const invite = await p.find(
      [ctx.page.getByRole("button", { name: /invite vendor/i }), ctx.page.getByText(/invite vendor/i)],
      { label: "invite-vendor", timeout: TIMEOUTS.MEDIUM },
    );
    expect(invite, "Invite Vendor action should be present on /vendors").toBeTruthy();
  },
};

// user module — Users workspace loads with Create User.
export const userListFlow: UiFlowModule = {
  key: "user.list",
  category: "masterdata",
  title: "Users workspace with Create User",
  covers: "nav /users → assert Create User (user module)",
  dependsOn: ["auth"],
  enabledFor: (c: ClientConfig) => (c.hasModule("user") ? gate(true, "user module") : gate(false, "no user module")),
  async run(ctx) {
    const p = await nav(ctx, "/users");
    const btn = await p.find(
      [ctx.page.getByRole("button", { name: /create user/i }), ctx.page.getByText(/create user/i)],
      { label: "create-user", timeout: TIMEOUTS.MEDIUM },
    );
    expect(btn, "Create User action should be present on /users").toBeTruthy();
  },
};

// erp_id_enabled — the Create User drawer exposes an ERP ID field.
export const userErpIdFlow: UiFlowModule = {
  key: "user.erp_id_field",
  category: "masterdata",
  title: "Create User form exposes ERP ID field",
  covers: "nav /users → Create User → assert ERP ID field (erp_id_enabled)",
  dependsOn: ["auth"],
  enabledFor: (c: ClientConfig) =>
    c.hasModule("user") && c.flag("erp_id_enabled")
      ? gate(true, "user module + erp_id_enabled")
      : gate(false, "erp_id_enabled off"),
  async run(ctx) {
    const p = await nav(ctx, "/users");
    await p.click(
      [ctx.page.getByRole("button", { name: /create user/i }), ctx.page.getByText(/create user/i)],
      { label: "open-create-user", timeout: TIMEOUTS.MEDIUM },
    );
    await ctx.page.waitForTimeout(1200);
    const field = await p.find(
      [
        ctx.page.getByText(/erp id/i),
        ctx.page.getByPlaceholder(/erp id/i),
        ctx.page.getByRole("textbox", { name: /erp id/i }),
      ],
      { label: "erp-id-field", timeout: TIMEOUTS.MEDIUM },
    );
    expect(field, "ERP ID field should be present in the Create User form").toBeTruthy();
  },
};

// can_skip_vendor_onboarding — the vendor workspace offers Start Onboarding.
export const vendorOnboardingFlow: UiFlowModule = {
  key: "vendor.onboarding_available",
  category: "vendor",
  title: "Vendor onboarding action available",
  covers: "nav /vendors → assert Start Onboarding (can_skip_vendor_onboarding)",
  dependsOn: ["auth"],
  enabledFor: (c: ClientConfig) =>
    c.flag("can_skip_vendor_onboarding") ? gate(true, "can_skip_vendor_onboarding") : gate(false, "vendor onboarding off"),
  async run(ctx) {
    const p = await nav(ctx, "/vendors");
    const btn = await p.find(
      [ctx.page.getByRole("button", { name: /start onboarding/i }), ctx.page.getByText(/start onboarding/i)],
      { label: "start-onboarding", timeout: TIMEOUTS.MEDIUM },
    );
    expect(btn, "Start Onboarding action should be present on /vendors").toBeTruthy();
  },
};

// is_contract_creation_enabled — OFF for clientA → SKIPS (ready for clients with contracts).
export const contractCreateFlow: UiFlowModule = {
  key: "contract.create",
  category: "vendor",
  title: "Contract creation available",
  covers: "assert contract creation entry (is_contract_creation_enabled)",
  dependsOn: ["auth"],
  enabledFor: (c: ClientConfig) =>
    c.flag("is_contract_creation_enabled") ? gate(true, "is_contract_creation_enabled") : gate(false, "contracts off (skip-gated)"),
  async run(ctx) {
    const p = await nav(ctx, "/purchase-orders");
    const entry = await p.find(
      [ctx.page.getByRole("tab", { name: /contract/i }), ctx.page.getByText(/contract/i), ctx.page.getByRole("button", { name: /contract/i })],
      { label: "contract-entry", timeout: TIMEOUTS.MEDIUM },
    );
    expect(entry, "contract entry should be present when contracts are enabled").toBeTruthy();
  },
};

// enable_pr_bulk_upload — OFF for clientA → this flow SKIPS (proves skip-gating).
export const prBulkUploadFlow: UiFlowModule = {
  key: "pr.bulk_upload",
  category: "pr",
  title: "PR bulk upload available",
  covers: "nav /purchase-requisitions → assert Bulk Upload entry (enable_pr_bulk_upload)",
  dependsOn: ["auth"],
  enabledFor: (c: ClientConfig) =>
    c.flag("enable_pr_bulk_upload") ? gate(true, "enable_pr_bulk_upload") : gate(false, "enable_pr_bulk_upload off (skip-gated)"),
  async run(ctx) {
    const p = await nav(ctx, "/purchase-requisitions");
    const entry = await p.find(
      [ctx.page.getByRole("link", { name: /bulk upload/i }), ctx.page.getByRole("button", { name: /bulk upload/i }), ctx.page.getByText(/bulk upload/i)],
      { label: "pr-bulk-upload", timeout: TIMEOUTS.MEDIUM },
    );
    expect(entry, "Bulk Upload entry should be present when enabled").toBeTruthy();
  },
};
