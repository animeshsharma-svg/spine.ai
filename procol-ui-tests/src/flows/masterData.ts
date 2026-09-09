import { expect } from "@playwright/test";
import { UiFlowModule, gate } from "../master/types.js";
import { ClientConfig } from "../master/config.js";
import { MasterDataPage } from "../pages/MasterDataPage.js";

/**
 * Master-data creation flows — categories/products/locations/teams/users.
 * Each fills every field the create form exposes and submits. Gated on the
 * client's module permission so they run wherever that module is authorized.
 */

export const createTeamFlow: UiFlowModule = {
  key: "masterdata.team",
  category: "masterdata",
  title: "Create a team",
  covers: "/teams → Create Team (name + type) → submit → verify",
  dependsOn: ["auth"],
  enabledFor: (c: ClientConfig) => (c.hasModule("team") ? gate(true, "team module") : gate(false, "no team module")),
  async run(ctx) {
    const md = new MasterDataPage(ctx.page);
    const { name, ok } = await md.createTeam();
    expect(ok, `team "${name}" should be created without error`).toBeTruthy();
  },
};

export const createLocationFlow: UiFlowModule = {
  key: "masterdata.location",
  category: "masterdata",
  title: "Create a location (buyer hub)",
  covers: "/locations → Create buyer hub (name/type/city/address/code) → submit → verify",
  dependsOn: ["auth"],
  enabledFor: (c: ClientConfig) => (c.hasModule("buyer_hub") ? gate(true, "buyer_hub module") : gate(false, "no buyer_hub module")),
  async run(ctx) {
    const md = new MasterDataPage(ctx.page);
    const { name, ok } = await md.createLocation();
    expect(ok, `location "${name}" should be created without error`).toBeTruthy();
  },
};

export const createUserFlow: UiFlowModule = {
  key: "masterdata.user",
  category: "masterdata",
  title: "Create a user",
  covers: "/users → Create User (name/ERP/email/phone/role) → submit → verify",
  dependsOn: ["auth"],
  enabledFor: (c: ClientConfig) => (c.hasModule("user") ? gate(true, "user module") : gate(false, "no user module")),
  async run(ctx) {
    const md = new MasterDataPage(ctx.page);
    const { name, email, ok } = await md.createUser();
    expect(ok, `user "${name}" <${email}> should be created without error`).toBeTruthy();
  },
};

export const createProductFlow: UiFlowModule = {
  key: "masterdata.product",
  category: "masterdata",
  title: "Create a product",
  covers: "/products → Add product (name/UOM/category/subcategory/article + variant) → create → verify",
  dependsOn: ["auth"],
  enabledFor: (c: ClientConfig) => (c.hasModule("product") ? gate(true, "product module") : gate(false, "no product module")),
  async run(ctx) {
    const md = new MasterDataPage(ctx.page);
    const { name, ok } = await md.createProduct();
    expect(ok, `product "${name}" should be created without error`).toBeTruthy();
  },
};
