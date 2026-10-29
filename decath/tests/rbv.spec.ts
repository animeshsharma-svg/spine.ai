import { test, type Browser } from "@playwright/test";
import { ALLOW_WRITES, BASE, CASES, PICKED, PO_DATASOURCE_UUID, ROLES, roleOfUser, type Case, type Role } from "../src/config.js";
import { poTruth } from "../src/db.js";
import { readList, listTabs, type PoList } from "../src/poList.js";
import { headerButtons, moreMenu, openPo } from "../src/poPage.js";
import { record, recorded } from "../src/results.js";
import { dismissPopups, signIn, tell } from "../src/signin.js";

/**
 * Aanya's RBV sheet, one test per case (cases.json), on Decathlon UAT.
 *
 * Each case signs in as the roles it names and judges what the screen shows
 * against Procol's database (read-only): whose each PO is, who it is shared
 * with, and whether it is a draft. A case that cannot run says why and is
 * recorded "Not tested": a user it names has no login in decath/.env yet, or
 * it changes data on UAT and DECATH_ALLOW_WRITES is not 1. Never a pass.
 */

const lists = new Map<string, PoList>();
/** One role's view of one PO tab, read once per run. */
async function listAs(browser: Browser, role: Role, caseId: string, tab = "Purchase Order"): Promise<PoList> {
  const k = `${role}|${tab}`;
  if (lists.has(k)) return lists.get(k)!;
  const s = await signIn(browser, role, caseId);
  try {
    const l = await readList(s.page, tab);
    tell(`${caseId} · the ${ROLES[role].words} sees ${l.total} POs on the ${tab} list`);
    lists.set(k, l);
    return l;
  } finally {
    await s.close();
  }
}

/** Why a case cannot run as written, or null. */
function blocked(c: Case): string | null {
  const missing = c.users.filter((u) => !roleOfUser(u));
  if (missing.length) return `no login yet for user ${missing.join(", ")} — add it to decath/.env to run this case`;
  if (c.writes && !ALLOW_WRITES) return "this case changes data on UAT (it edits, shares, approves, creates or deletes a PO); it runs only when DECATH_ALLOW_WRITES=1";
  return null;
}

const SCRIPTS: Record<string, (browser: Browser, c: Case) => Promise<void>> = {
  // Only own + shared POs listed; searching another user's unshared PO finds nothing.
  async RBV_001(browser, c) {
    const uid = ROLES.general_user.userId;
    const mine = await listAs(browser, "general_user", c.id);
    const truth = await poTruth(mine.rows.map((r) => r.id));
    const notMine = mine.rows.filter((r) => { const t = truth.get(r.id); return !t || (t.owner !== uid && !t.sharedUsers.includes(uid)); });
    const all = await listAs(browser, "super_admin", c.id);
    const allTruth = await poTruth(all.rows.map((r) => r.id));
    const other = all.rows.find((r) => r.status !== "0" && allTruth.get(r.id)?.owner !== uid && !allTruth.get(r.id)?.sharedUsers.includes(uid));
    const shared = [...truth.values()].filter((t) => t.sharedUsers.includes(uid)).length;
    const s = await signIn(browser, "general_user", c.id);
    try {
      await s.page.goto(`${BASE}/purchase-order-flexi`, { waitUntil: "domcontentloaded" });
      await s.page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
      await dismissPopups(s.page);
      const shot1 = await s.shot("po-list");
      const box = s.page.getByPlaceholder(/search using any field/i).first();
      await box.fill(other!.po);
      await s.page.keyboard.press("Enter");
      await s.page.waitForTimeout(3500);
      const found = await s.page.getByText(other!.po, { exact: true }).count();
      const shot2 = await s.shot("searched-another-users-po");
      tell(`${c.id} · searched ${other!.po} (${other!.createdBy}'s, not shared): ${found ? "it is in the list" : "no result"}`);
      const pass = notMine.length === 0 && found === 0;
      record({
        id: c.id,
        verdict: pass ? "Pass" : "Fail",
        actual:
          `The list shows ${mine.total} POs; ${notMine.length ? `${notMine.length} are neither 23170's nor shared with them (e.g. ${notMine.slice(0, 3).map((r) => r.po).join(", ")})` : "every one is 23170's own"}` +
          ` (${shared} shared with them). Searching ${other!.po}, another user's PO not shared with 23170: ${found ? "found" : "no result"}.`,
        comment: shared ? "" : "No PO on UAT is shared with 23170, so the 'shared' half of the rule could not be seen; share one with them to check it.",
        shots: [shot1, shot2],
      });
    } finally {
      await s.close();
    }
  },

  // Account validator: every PO, count = super admin's.
  async RBV_003(browser, c) {
    const av = await listAs(browser, "account_validator", c.id);
    const sa = await listAs(browser, "super_admin", c.id);
    const nd = (l: PoList) => new Set(l.rows.filter((r) => r.status !== "0").map((r) => r.id));
    const avNd = nd(av), saNd = nd(sa);
    const missing = [...saNd].filter((i) => !avNd.has(i)).length;
    const drafts = (l: PoList) => l.rows.filter((r) => r.status === "0").length;
    const countsMatch = av.total === sa.total;
    record({
      id: c.id,
      verdict: countsMatch && missing === 0 ? "Pass" : "Fail",
      actual:
        `Account validator: ${av.total} POs; super admin: ${sa.total}. ` +
        `Every non-draft PO the super admin sees (${saNd.size}) is in the account validator's list${missing ? ` except ${missing}` : ""}. ` +
        `The difference is drafts: the super admin's list has his ${drafts(sa)} own drafts, the account validator's has its own ${drafts(av)}; nobody sees another user's draft.`,
      comment: countsMatch ? "" : "The counts differ only by drafts, which each user sees only for themselves. Confirm whether an account validator should see other users' drafts; if not, the expected result should read 'all non-draft POs'.",
    });
  },

  // Same rules on the other PO lists.
  async RBV_004(browser, c) {
    const s = await signIn(browser, "super_admin", c.id);
    let tabs: string[] = [];
    try { tabs = await listTabs(s.page); } finally { await s.close(); }
    const others = tabs.filter((t) => !/^purchase order$/i.test(t));
    const asked = ["Rent", "Gift", "Candex"];
    const absent = asked.filter((a) => !others.some((t) => t.toLowerCase().includes(a.toLowerCase())));
    const lines: string[] = [];
    let ok = true;
    for (const tab of others) {
      const gu = await listAs(browser, "general_user", c.id, tab);
      const av = await listAs(browser, "account_validator", c.id, tab);
      const sa = await listAs(browser, "super_admin", c.id, tab);
      const t = await poTruth([...new Set([...gu.rows, ...av.rows, ...sa.rows].map((r) => r.id))]);
      const uid = ROLES.general_user.userId;
      const guBad = gu.rows.filter((r) => { const x = t.get(r.id); return !x || (x.owner !== uid && !x.sharedUsers.includes(uid)); }).length;
      const nd = (l: PoList) => new Set(l.rows.filter((r) => r.status !== "0").map((r) => r.id));
      const avMiss = [...nd(sa)].filter((i) => !nd(av).has(i)).length;
      if (guBad || avMiss) ok = false;
      lines.push(`${tab}: 23170 sees ${gu.total}${guBad ? `, ${guBad} not theirs` : ", all their own"}; 23172 sees ${av.total} (super admin ${sa.total})${avMiss ? `, missing ${avMiss} non-draft` : ", every non-draft PO"}`);
    }
    record({
      id: c.id,
      // A list the case names that is not there is not tested — never folded into a pass.
      verdict: !ok ? "Fail" : !others.length || absent.length ? "Not tested" : "Pass",
      actual: `${others.length ? lines.join(". ") + "." : "No other PO list on the PO page."}${absent.length ? ` No ${absent.join(" / ")} PO list on the PO page (tabs: ${tabs.join(", ")}).` : ""}`,
      comment: absent.length ? `Checked the lists that exist; ${absent.join(", ")} ${absent.length === 1 ? "is" : "are"} not on Decathlon UAT's PO page — tell me where to find ${absent.length === 1 ? "it" : "them"}.` : "",
    });
  },

  // Another user's PO by its link: refused; own PO opens.
  async RBV_005(browser, c) {
    const uid = ROLES.general_user.userId;
    const all = await listAs(browser, "super_admin", c.id);
    const t = await poTruth(all.rows.map((r) => r.id));
    const other = all.rows.find((r) => r.status !== "0" && t.get(r.id)?.owner !== uid && !t.get(r.id)?.sharedUsers.includes(uid))!;
    const mine = (await listAs(browser, "general_user", c.id)).rows.find((r) => r.status !== "0")!;
    const url = (r: { uuid: string }) => `${BASE}/flexi_record/${PO_DATASOURCE_UUID}/${r.uuid}`;
    const s = await signIn(browser, "general_user", c.id);
    try {
      await s.page.goto(url(other), { waitUntil: "domcontentloaded" });
      await s.page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
      await s.page.waitForTimeout(2500);
      await dismissPopups(s.page);
      const text = await s.page.evaluate(() => document.body.innerText.slice(0, 2000));
      const opened = text.includes(other.po);
      const said = (text.match(/(access denied|not authori[sz]ed[^\n]{0,60}|no access|permission[^\n]{0,60}|not found)/i) || [""])[0].trim();
      const shot1 = await s.shot("another-users-po-by-link");
      tell(`${c.id} · opened ${other.po} (${other.createdBy}'s) by its link: ${opened ? "it opened" : `refused${said ? ` — “${said}”` : ""}`}`);
      await s.page.goto(url(mine), { waitUntil: "domcontentloaded" });
      await s.page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
      await s.page.waitForTimeout(2500);
      const ownOpened = (await s.page.evaluate(() => document.body.innerText.slice(0, 2000))).includes(mine.po);
      const shot2 = await s.shot("own-po-by-link");
      tell(`${c.id} · opened own ${mine.po} by its link: ${ownOpened ? "it opened" : "it did not open"}`);
      record({
        id: c.id,
        verdict: !opened && ownOpened ? "Pass" : "Fail",
        actual: `${other.po} (${other.createdBy}'s, not shared with 23170) by its link: ${opened ? "opened, with its details" : `not shown${said ? ` — the page said “${said}”` : ""}`}. Own PO ${mine.po}: ${ownOpened ? "opened" : "did not open"}.`,
        shots: [shot1, shot2],
      });
    } finally {
      await s.close();
    }
  },

  // No one can delete a PO (Aanya's rule, 22 Oct). Looked for — the ⋮ menu opened and read — never clicked.
  async RBV_009(browser, c) {
    const gu = ROLES.general_user.userId;
    const seen: string[] = [];
    const shots: string[] = [];
    let anyDelete = false;
    let target: { uuid: string; po: string; createdBy: string } | null = null;
    const look = async (role: Role, who: string) => {
      const s = await signIn(browser, role, c.id);
      try {
        if (!target) {
          // A released PO of the general user's that the account validator sees: "someone else's" for 23172.
          const l = await readList(s.page);
          const t = await poTruth(l.rows.map((r) => r.id));
          target = l.rows.find((r) => r.status !== "0" && t.get(r.id)?.owner === gu) ?? null;
          if (!target) throw new Error("the account validator's list has no released PO of the general user's to look at");
        }
        const opened = await openPo(s.page, target.uuid, target.po);
        if (!opened) { seen.push(`${who}: ${target.po} did not open`); return; }
        const buttons = await headerButtons(s.page);
        const menu = await moreMenu(s.page);
        // Only the page's own controls count: a line item's text could say "delete" too.
        const del = [...buttons, ...menu].some((x) => /delete|remove/i.test(x));
        if (del) anyDelete = true;
        shots.push(await s.shot(`${who}-po-page`));
        seen.push(`${who}: ${del ? "a Delete is offered" : "no Delete"} (header: ${buttons.join(", ") || "none"}; ⋮ menu: ${menu.join(", ") || "empty"})`);
        tell(`${c.id} · ${who} on ${target.po}: ${del ? "Delete is offered" : "no Delete"} — ⋮ menu: ${menu.join(", ") || "empty"}`);
      } finally {
        await s.close();
      }
    };
    await look("account_validator", "23172 (not the creator)");
    await look("general_user", "23170 (its creator)");
    await look("super_admin", "the super admin");
    const t = target as { po: string } | null;
    record({
      id: c.id,
      verdict: anyDelete ? "Fail" : "Pass",
      actual: `${t?.po ?? "The PO"} (the general user's, released) — ${seen.join(". ")}.`,
      shots,
    });
  },
};

// Only the picked cases are registered: the others are not listed as skipped steps of this run.
for (const c of CASES.filter((x) => !PICKED.length || PICKED.includes(x.id))) {
  test(`${c.id} — ${c.title}`, async ({ browser }) => {
    test.setTimeout(20 * 60_000);
    tell(`${c.id} · ${c.title} — expected: ${c.expected}`);
    const why = blocked(c) ?? (SCRIPTS[c.id] ? null : "the steps for this case are not automated yet");
    if (why) {
      record({ id: c.id, verdict: "Not tested", actual: `Not run: ${why}.` });
      return;
    }
    await SCRIPTS[c.id](browser, c);
    // A Fail fails the test too, so the run (and the dashboard) reads red, not green.
    const r = recorded(c.id);
    if (r?.verdict === "Fail") throw new Error(`${c.id} failed: ${r.actual}`);
  });
}
