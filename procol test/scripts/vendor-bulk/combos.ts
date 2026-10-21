/**
 * FIELD COMBINATIONS for vendor bulk upload — many vendors per sheet, every
 * pair of field values covered.
 *
 * All values of all 18 columns together would be billions of rows. This
 * generates an ALL-PAIRS set instead: every value of every column appears
 * next to every value of every other column at least once. Each generated
 * row is one vendor; the rows are cut into sheets of 1 to 100 vendors.
 *
 * The expected answer of every row comes from a model of the deployed row
 * check (PR 16267 @ab282ab7e3, vendor_bulk_upload_validation_service_v2.rb):
 *
 *   no-tax fields → tax number → mandatory → PAN → Deals In → email →
 *   POC 2 email → Vendor Profile → Status → Onboarding → City (no-contactless only)
 *
 * then the worker: vendor code over 100 characters, the POC 2 pair (after
 * the vendor exists — BUG-07), and where the created vendor lands
 * (rejected → Rejected; onboarding "No" → Vendors; otherwise → Prospects).
 *
 * Values already covered by a dedicated case AND hit by a known bug (that
 * would change the row's answer and hide the rest of it) are left out:
 * GSTIN with a trailing space (BUG-28), profile with a trailing space
 * (BUG-22), emails with '..' (BUG-23), valid + invalid Deals In (BUG-14),
 * an Account Group outside the list (BUG-15).
 *
 * SAFETY. A row the model says would be CREATED and would email real people
 * gets a tripwire instead, so it is checked but creates nothing:
 *   • a Prospect with a contact email (the "new prospect" mail to the
 *     vendor-management team) → Status = QA_TRIPWIRE;
 *   • a valid POC 2 pair (its invitation mails that team, BUG-29) and a
 *     rejected row with no contact (a user with no email) →
 *     Vendor Onboarding Required = QA_TRIPWIRE.
 */
import type { Cell } from "../../src/flows/vendorBulkUpload.js";
import type { Requires, RowExpect, VbuCase } from "./spec.js";

type Stage = "either" | "tax" | "mand" | "pan" | "deals" | "email" | "email2" | "profile" | "status" | "onb" | "city";

interface Level {
  id: string;
  /** cells this value writes; {{n}} = the row's own number, {{tag}} = case+row tag */
  cells: Record<string, Cell>;
  note?: string;
  /** a value that always emails real people when the row is created: checked in one row of its own, never combined */
  neverCreate?: boolean;
}
interface Factor { name: string; levels: Level[] }

export interface ComboHelpers {
  MSG: Record<string, string>;
  PD_REQUIRED: Record<string, Cell>;
}

// ── a small deterministic random source, so the generated set never changes between runs ──
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function allPairs(factors: Factor[], seed: number): number[][] {
  const rand = rng(seed);
  const key = (a: number, i: number, b: number, j: number) => `${a}:${i}|${b}:${j}`;
  const uncovered = new Set<string>();
  for (let a = 0; a < factors.length; a++)
    for (let b = a + 1; b < factors.length; b++)
      for (let i = 0; i < factors[a].levels.length; i++)
        for (let j = 0; j < factors[b].levels.length; j++) uncovered.add(key(a, i, b, j));
  const rows: number[][] = [];
  const gain = (row: number[]) => {
    let g = 0;
    for (let a = 0; a < row.length; a++) for (let b = a + 1; b < row.length; b++) if (uncovered.has(key(a, row[a], b, row[b]))) g++;
    return g;
  };
  while (uncovered.size) {
    let best: number[] = [];
    let bestGain = -1;
    for (let t = 0; t < 40; t++) {
      // start from one uncovered pair, fill the rest greedily in a random order
      const first = [...uncovered][Math.floor(rand() * uncovered.size)];
      const [[fa, ia], [fb, ib]] = first.split("|").map((p) => p.split(":").map(Number));
      const row = factors.map(() => -1);
      row[fa] = ia;
      row[fb] = ib;
      const order = factors.map((_, i) => i).filter((i) => row[i] < 0).sort(() => rand() - 0.5);
      for (const f of order) {
        let bl = 0;
        let bg = -1;
        for (let l = 0; l < factors[f].levels.length; l++) {
          let g = 0;
          for (let o = 0; o < factors.length; o++) if (o !== f && row[o] >= 0 && uncovered.has(o < f ? key(o, row[o], f, l) : key(f, l, o, row[o]))) g++;
          if (g > bg || (g === bg && rand() < 0.3)) { bg = g; bl = l; }
        }
        row[f] = bl;
      }
      const g = gain(row);
      if (g > bestGain) { bestGain = g; best = row; }
    }
    for (let a = 0; a < best.length; a++) for (let b = a + 1; b < best.length; b++) uncovered.delete(key(a, best[a], b, best[b]));
    rows.push(best);
  }
  return rows;
}

type Client = "gmmco" | "pd";

/** The values every column can take, for one kind of workspace. */
function factorsFor(client: Client): Factor[] {
  const contactless = client === "gmmco";
  const F: Factor[] = [
    { name: "Company Name", levels: [
      { id: "valid", cells: { "Company Name": "QA_Platform_VBU_{{stamp}}_{{tag}}" } },
      { id: "blank", cells: { "Company Name": "" } },
    ] },
    { name: "Tax", levels: [
      { id: "none", cells: {} },
      { id: "UK VAT, valid", cells: { "Tax Type": "VAT", "Tax No.": "GB9{{d4}}{{n4}}", "Business Location": "United Kingdom" } },
      { id: "GST, valid", cells: { "Tax Type": "GST", "Tax No.": "27QATZQ{{d4}}{{gl}}{{gx}}Z5", "Business Location": "India" } },
      { id: "Tax No. without Tax Type", cells: { "Tax No.": "GB9{{d4}}{{n4}}", "Business Location": "United Kingdom" } },
      { id: "Tax No. without Business Location", cells: { "Tax Type": "VAT", "Tax No.": "GB9{{d4}}{{n4}}" } },
      { id: "VAT in a wrong format", cells: { "Tax Type": "VAT", "Tax No.": "GB12{{n4}}", "Business Location": "United Kingdom" } },
      { id: "VAT in lower case", cells: { "Tax Type": "VAT", "Tax No.": "gb9{{d4}}{{n4}}", "Business Location": "United Kingdom" } },
    ] },
    { name: "City", levels: [
      { id: "blank", cells: {} },
      { id: "Mumbai", cells: { City: "Mumbai" } },
      { id: "MUMBAI (capitals)", cells: { City: "MUMBAI" } },
      { id: "not in Procol's list", cells: { City: "QA Nowhere {{stamp}}" }, note: "BUG-10: stored as city id 0" },
    ] },
    { name: "Address", levels: [
      { id: "blank", cells: {} },
      { id: "valid", cells: { Address: "QA Combo Road {{n}}" } },
    ] },
    { name: "Vendor Profile", levels: [
      { id: "blank", cells: {} },
      { id: "profile 1", cells: { "Vendor Profile": "{{profile}}" } },
      { id: "profile 2", cells: { "Vendor Profile": "{{profile2}}" } },
      { id: "profile in capitals", cells: { "Vendor Profile": "{{profileUpper}}" } },
      { id: "not a profile", cells: { "Vendor Profile": "QA_NOT_A_PROFILE" } },
    ] },
    { name: "POC", levels: [
      { id: "none", cells: {} },
      { id: "name + valid email", cells: { "POC - Full Name": "QA Platform Tester", "POC - Email Address": "qa_vbu_{{stamp}}_{{tagl}}@example.com" } },
      { id: "name only", cells: { "POC - Full Name": "QA Platform Tester" } },
      { id: "email only", cells: { "POC - Email Address": "qa_vbu_{{stamp}}_{{tagl}}@example.com" } },
      { id: "invalid email", cells: { "POC - Full Name": "QA Platform Tester", "POC - Email Address": "qa_vbu_{{stamp}}_{{tagl}}@" } },
    ] },
    { name: "Vendor Code", levels: [
      { id: "blank", cells: {} },
      { id: "unique", cells: { "Vendor Code": "QAC{{stamp}}{{tag}}" } },
      { id: "over 100 characters", cells: { "Vendor Code": "QAL{{stamp}}{{tag}}{{pad100}}" } },
    ] },
    { name: "VRP Code", levels: [
      { id: "blank", cells: {} },
      { id: "unique", cells: { "VRP Code": "QAR{{stamp}}{{tag}}" } },
    ] },
    { name: "PAN", levels: [
      { id: "blank", cells: {} },
      { id: "valid, matching the GSTIN", cells: { "PAN No.": "QATZQ{{d4}}{{gl}}" } },
      { id: "valid, NOT matching the GSTIN", cells: { "PAN No.": "QATZR{{d4}}{{gl}}" } },
      { id: "wrong format", cells: { "PAN No.": "QA12345" } },
    ] },
    { name: "Pincode", levels: [
      { id: "blank", cells: {} },
      { id: "6 digits", cells: { Pincode: "400001" } },
      { id: "with a space", cells: { Pincode: "400 001" } },
      { id: "typed as a number", cells: { Pincode: { n: "560001" } } },
    ] },
    { name: "POC 2", levels: [
      { id: "none", cells: {} },
      { id: "name only", cells: { "POC 2 - Full Name": "QA Second Contact" } },
      { id: "email only", cells: { "POC 2 - Email Address": "qa_vbu_{{stamp}}_{{tagl}}_2@example.com" } },
      { id: "invalid email", cells: { "POC 2 - Full Name": "QA Second Contact", "POC 2 - Email Address": "bad@" } },
      { id: "name + valid email", cells: { "POC 2 - Full Name": "QA Second Contact", "POC 2 - Email Address": "qa_vbu_{{stamp}}_{{tagl}}_2@example.com" }, neverCreate: true },
    ] },
    { name: "Deals In", levels: [
      { id: "blank", cells: {} },
      { id: "one category code", cells: { "Deals In": "{{categoryUuid}}" } },
      { id: "two category codes", cells: { "Deals In": "{{categoryUuid}},{{categoryUuid2}}" } },
      { id: "unknown code", cells: { "Deals In": "QA_NOT_A_CATEGORY" } },
      { id: "category name", cells: { "Deals In": "{{categoryName}}" }, note: "BUG-32: accepted but the vendor is not put in the category" },
    ] },
    { name: "Status", levels: [
      { id: "blank", cells: {} },
      { id: "active", cells: { Status: "active" } },
      { id: "rejected", cells: { Status: "rejected" } },
      { id: "Rejected (capital, space)", cells: { Status: "Rejected " } },
      { id: "not a status", cells: { Status: "Approved" } },
    ] },
    { name: "Vendor Onboarding Required", levels: [
      { id: "blank", cells: {} },
      { id: "Yes", cells: { "Vendor Onboarding Required": "Yes" } },
      { id: "No", cells: { "Vendor Onboarding Required": "No" } },
      { id: "no (lower case)", cells: { "Vendor Onboarding Required": "no" } },
      { id: "not Yes/No", cells: { "Vendor Onboarding Required": "Maybe" } },
    ] },
  ];
  if (contactless) {
    F.push(
      { name: "Account Group", levels: [{ id: "blank", cells: {} }, { id: "ZCOV", cells: { "Account Group": "ZCOV" } }, { id: "ZDGS", cells: { "Account Group": "ZDGS" } }] },
      { name: "MSME Registration Number", levels: [{ id: "blank", cells: {} }, { id: "filled", cells: { "MSME Registration Number": "UDYAM-MH-00-{{n7}}" } }] },
      { name: "Bank Account Number", levels: [
        { id: "blank", cells: {} }, { id: "text", cells: { "Bank Account Number": "00000{{n7}}" } }, { id: "typed as a number", cells: { "Bank Account Number": { n: "12345678901" } } },
      ] },
      { name: "Bank IFSC Code", levels: [{ id: "blank", cells: {} }, { id: "filled", cells: { "Bank IFSC Code": "QATZ0{{n6}}" } }] },
    );
  }
  return F;
}

interface Outcome {
  stage?: Stage;
  error?: string;
  workerError?: string;
  created: boolean;
  tab?: "active" | "invited" | "rejected";
  risky?: "prospect-mail" | "poc2-mail" | "no-email-user";
  /** the row would reach the external tax-number provider */
  externalLookup?: boolean;
  notes: string[];
}

/** The deployed row check and worker, as a function of the chosen values. */
function evaluate(client: Client, pick: Record<string, string>, MSG: Record<string, string>): Outcome {
  const contactless = client === "gmmco";
  const notes: string[] = [];
  const tax = pick["Tax"];
  const taxNo = tax !== "none";
  const taxBad = ["Tax No. without Tax Type", "Tax No. without Business Location", "VAT in a wrong format", "VAT in lower case"].includes(tax);
  const isGst = tax === "GST, valid";
  const name = pick["Company Name"] !== "blank";
  const poc = pick["POC"];
  const pocName = poc === "name + valid email" || poc === "name only" || poc === "invalid email";
  const pocEmail = poc === "name + valid email" || poc === "email only" || poc === "invalid email";
  const pocEmailValid = poc === "name + valid email" || poc === "email only";
  const profile = pick["Vendor Profile"];
  const city = pick["City"];
  const address = pick["Address"];
  const fail = (stage: Stage, error: string): Outcome => ({ stage, error, created: false, notes });

  if (!taxNo && !contactless && (city === "blank" || address === "blank")) return fail("either", MSG.EITHER);
  if (taxNo && taxBad) return fail("tax", MSG.TAXINV);
  if (!name) return fail("mand", MSG.MAND);
  if (!contactless && (profile === "blank" || !pocName || !pocEmail)) return fail("mand", MSG.MAND);
  if (pick["PAN"] === "wrong format") return fail("pan", MSG.PAN_INVALID);
  if (pick["PAN"] === "valid, NOT matching the GSTIN" && isGst) return fail("pan", MSG.PAN_MISMATCH);
  if (pick["Deals In"] === "unknown code") return fail("deals", `${MSG.DEALS}QA_NOT_A_CATEGORY`);
  if ((!contactless || pocEmail) && poc === "invalid email") return fail("email", MSG.EMAIL);
  if (pick["POC 2"] === "invalid email") return fail("email2", MSG.EMAIL2);
  if (profile === "not a profile") return fail("profile", MSG.PROFILE);
  if (pick["Status"] === "not a status") return fail("status", MSG.STATUS);
  if (pick["Vendor Onboarding Required"] === "not Yes/No") return fail("onb", MSG.ONB);
  if (!contactless && !taxNo && city === "not in Procol's list") return fail("city", MSG.CITY);

  // the worker: its messages are joined with ", " (worker_v2.rb:105-110, 146-150, 175-179)
  const workerErrors: string[] = [];
  const codeTooLong = pick["Vendor Code"] === "over 100 characters";
  if (codeTooLong) workerErrors.push(MSG.VCODE);
  const rejected = pick["Status"] === "rejected" || pick["Status"] === "Rejected (capital, space)";
  const onb = pick["Vendor Onboarding Required"];
  const skip = onb === "No" || onb === "no (lower case)";
  const tab = rejected ? "rejected" : skip ? "active" : "invited";
  const poc2 = pick["POC 2"];
  const poc2Partial = poc2 === "name only" || poc2 === "email only";
  if (poc2Partial) workerErrors.push(MSG.POC2);
  const out: Outcome = { created: !codeTooLong, tab, notes };
  if (workerErrors.length) out.workerError = workerErrors.join(", ");
  if (poc2Partial && !codeTooLong) notes.push("BUG-07: the row is marked failed but the vendor IS created; today it appears in the Vendors list");
  /** a tax number with no city or no address is looked up with the external GST/VAT provider (send_service.rb:42-48) */
  out.externalLookup = !codeTooLong && taxNo && (city === "blank" || address === "blank");
  // what would mail real people
  if (tab === "invited" && pocEmailValid) out.risky = "prospect-mail";
  else if (poc2 === "name + valid email") out.risky = "poc2-mail";
  else if (rejected && !pocEmail && contactless) out.risky = "no-email-user";
  if (city === "not in Procol's list") notes.push("BUG-10: the unknown city is stored as city id 0");
  if (pick["Deals In"] === "category name") notes.push("BUG-32: accepted, but the vendor is not put in that category");
  return out;
}

const SHEET_SIZES = [1, 5, 10, 25]; // the rest of the rows go into the last sheets of up to 50

/** The value of each column in a plain, valid row — the base the faults are put into. */
const REFERENCE: Record<string, string> = {
  "Company Name": "valid", Tax: "none", City: "Mumbai", Address: "valid", "Vendor Profile": "profile 1", POC: "name + valid email",
  "Vendor Code": "blank", "VRP Code": "blank", PAN: "blank", Pincode: "blank", "POC 2": "none", "Deals In": "blank", Status: "blank",
  "Vendor Onboarding Required": "No", "Account Group": "blank", "MSME Registration Number": "blank", "Bank Account Number": "blank", "Bank IFSC Code": "blank",
};

type PlanRow = { levels: number[]; kind: "valid combination" | "one fault" | "two faults"; faults: string[] };

/**
 * The rows: (1) all pairs of the ACCEPTED values; (2) every rejected value on
 * its own in an otherwise valid row; (3) every pair of rejected values from
 * different columns (which message wins = the order of the checks). Which
 * values are accepted or rejected is decided by the model for this workspace.
 */
function buildPlan(client: Client, factors: Factor[], MSG: Record<string, string>): { plan: PlanRow[]; stats: Record<string, number> } {
  const ref = factors.map((f) => f.levels.findIndex((l) => l.id === REFERENCE[f.name]));
  const pickOf = (lv: number[]) => Object.fromEntries(factors.map((f, i) => [f.name, f.levels[lv[i]].id]));
  const accepted = factors.map((f, fi) =>
    f.levels.map((_, li) => {
      const lv = [...ref];
      lv[fi] = li;
      const o = evaluate(client, pickOf(lv), MSG);
      return o.created && !o.workerError && !f.levels[li].neverCreate;
    }),
  );
  const neverCreate: [number, number][] = [];
  factors.forEach((f, fi) => f.levels.forEach((l, li) => { if (l.neverCreate) neverCreate.push([fi, li]); }));
  // (1) all pairs of accepted values
  const validIdx = factors.map((f, fi) => f.levels.map((_, li) => li).filter((li) => accepted[fi][li]));
  const sub: Factor[] = factors.map((f, fi) => ({ name: f.name, levels: validIdx[fi].map((li) => f.levels[li]) }));
  const positives = allPairs(sub, client === "gmmco" ? 47053 : 198678).map((row) => row.map((li, fi) => validIdx[fi][li]));
  const plan: PlanRow[] = positives.map((levels) => ({ levels, kind: "valid combination", faults: [] }));
  // (2) one fault
  let k = 0;
  const faultsOf: [number, number][] = [];
  factors.forEach((f, fi) => f.levels.forEach((l, li) => { if (!accepted[fi][li] && !l.neverCreate) faultsOf.push([fi, li]); }));
  for (const [fi, li] of neverCreate) {
    const lv = [...positives[k++ % positives.length]];
    lv[fi] = li;
    plan.push({ levels: lv, kind: "one fault", faults: [`${factors[fi].name}: ${factors[fi].levels[li].id} (checked with a tripwire: creating it would email real people)`] });
  }
  for (const [fi, li] of faultsOf) {
    const lv = [...positives[k++ % positives.length]];
    lv[fi] = li;
    plan.push({ levels: lv, kind: "one fault", faults: [`${factors[fi].name}: ${factors[fi].levels[li].id}`] });
  }
  // (3) two faults, from different columns
  for (let a = 0; a < faultsOf.length; a++)
    for (let b = a + 1; b < faultsOf.length; b++) {
      const [fa, la] = faultsOf[a];
      const [fb, lb] = faultsOf[b];
      if (fa === fb) continue;
      const lv = [...positives[k++ % positives.length]];
      lv[fa] = la;
      lv[fb] = lb;
      plan.push({ levels: lv, kind: "two faults", faults: [`${factors[fa].name}: ${factors[fa].levels[la].id}`, `${factors[fb].name}: ${factors[fb].levels[lb].id}`] });
    }
  let pairs = 0;
  for (let a = 0; a < sub.length; a++) for (let b = a + 1; b < sub.length; b++) pairs += sub[a].levels.length * sub[b].levels.length;
  return {
    plan,
    stats: { columns: factors.length, values: factors.reduce((n, f) => n + f.levels.length, 0), acceptedValues: sub.reduce((n, f) => n + f.levels.length, 0),
      rejectedValues: faultsOf.length, acceptedPairs: pairs, validRows: positives.length, oneFaultRows: faultsOf.length, twoFaultRows: plan.length - positives.length - faultsOf.length },
  };
}

/** Rows of the three kinds, interleaved so every sheet mixes them. */
function interleave(plan: PlanRow[]): PlanRow[] {
  const groups = ["valid combination", "one fault", "two faults"].map((k) => plan.filter((r) => r.kind === k));
  const out: PlanRow[] = [];
  const total = plan.length;
  const at = [0, 0, 0];
  while (out.length < total) {
    for (let g = 0; g < 3; g++) {
      // take from each group in proportion to its size
      const want = Math.ceil(((out.length + 1) * groups[g].length) / total);
      while (at[g] < Math.min(want, groups[g].length)) out.push(groups[g][at[g]++]);
    }
    if (out.length < total && at.every((v, g) => v >= groups[g].length)) break;
  }
  return out;
}

/**
 * The combination cases for one kind of workspace: the rows cut into sheets
 * of 1, 5, 10, 25 and up to 50 vendors, plus one sheet of 100 vendors (the
 * same rows again, with their own names and tax numbers).
 */
export function comboCases(client: Client, firstId: number, h: ComboHelpers): VbuCase[] {
  const { MSG } = h;
  const factors = factorsFor(client);
  const { plan: raw } = buildPlan(client, factors, MSG);
  const plan = interleave(raw);
  const requires: Requires = client === "gmmco"
    ? { contactless: true, canSkip: true, extraField: "Account Group" }
    : { contactless: false, invitationV2: false, canSkip: true, requiredExtraFields: true };
  const where = client === "gmmco" ? "GMMCO-type workspace (contactless ON, duplicate-check fields, Account Group/MSME/bank columns)" : "PROCOL DEMO-type workspace (contactless OFF, required extra fields)";

  let serial = 0;
  const makeRow = (caseNo: number, rowNo: number, pr: PlanRow) => {
    serial++;
    const pick: Record<string, string> = {};
    factors.forEach((f, i) => (pick[f.name] = f.levels[pr.levels[i]].id));
    let outcome = evaluate(client, pick, MSG);
    // A row that reaches the worker with a tax number but no city or no address
    // would send that tax number to the external GST/VAT provider: fill them in.
    const filledIn: string[] = [];
    if (outcome.externalLookup) {
      if (pick["City"] === "blank") { pick["City"] = "Mumbai"; filledIn.push("City"); }
      if (pick["Address"] === "blank") { pick["Address"] = "valid"; filledIn.push("Address"); }
      outcome = evaluate(client, pick, MSG);
    }
    let tripwire: "" | "Status" | "Vendor Onboarding Required" = "";
    if (outcome.created && outcome.risky) {
      tripwire = outcome.risky === "prospect-mail" ? "Status" : "Vendor Onboarding Required";
      const forced = { ...pick, [tripwire]: tripwire === "Status" ? "not a status" : "not Yes/No" };
      outcome = evaluate(client, forced, MSG);
    }
    const tag = `C${caseNo}R${rowNo}`;
    const n = String(1000 + (serial % 9000));
    const fill = (v: Cell): Cell => typeof v === "string"
      ? v.replace(/\{\{tag\}\}/g, tag).replace(/\{\{tagl\}\}/g, tag.toLowerCase()).replace(/\{\{n\}\}/g, String(serial))
        .replace(/\{\{n4\}\}/g, n).replace(/\{\{n6\}\}/g, String(100000 + serial)).replace(/\{\{n7\}\}/g, String(1000000 + serial))
        .replace(/\{\{gl\}\}/g, String.fromCharCode(65 + (serial % 26))).replace(/\{\{gx\}\}/g, "123456789ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(serial / 26) % 33])
        .replace(/\{\{pad100\}\}/g, "V".repeat(100))
      : v;
    const cells: Record<string, Cell> = {};
    factors.forEach((f) => { for (const [k, v] of Object.entries(f.levels.find((l) => l.id === pick[f.name])!.cells)) cells[k] = fill(v); });
    if (client === "pd") Object.assign(cells, h.PD_REQUIRED);
    if (tripwire) cells[tripwire] = "QA_TRIPWIRE";
    if (filledIn.length) outcome.notes.push(`${filledIn.join(" and ")} filled in: with a tax number and no ${filledIn.join("/").toLowerCase()}, the upload looks the number up with the external GST/VAT provider (approval needed, VBU-236)`);
    const expect: RowExpect = outcome.created && !outcome.workerError
      ? { status: "success", verify: { bscm: outcome.tab } }
      : { status: "failed", error: outcome.error ?? outcome.workerError };
    if (outcome.workerError?.startsWith(MSG.VCODE)) expect.verify = { absent: true };
    const describe = factors.map((f) => `${f.name}: ${pick[f.name]}`).join(" · ");
    return { cells, expect, outcome, tripwire, describe, kind: pr.kind, faults: pr.faults };
  };

  const cut: PlanRow[][] = [];
  let at = 0;
  for (const size of SHEET_SIZES) { if (at < plan.length) cut.push(plan.slice(at, at + size)); at += size; }
  while (at < plan.length) { cut.push(plan.slice(at, at + 50)); at += 50; }
  const volume: PlanRow[] = [];
  while (volume.length < 100) volume.push(...plan.slice(0, 100 - volume.length));
  cut.push(volume);

  return cut.map((sheetPlan, si) => {
    const id = `VBU-${firstId + si}`;
    const rows = sheetPlan.map((pr, ri) => makeRow(firstId + si, ri + 1, pr));
    const created = rows.filter((r) => r.outcome.created && !r.outcome.workerError).length;
    const tripped = rows.filter((r) => r.tripwire).length;
    const isVolume = si === cut.length - 1;
    const label = client === "gmmco" ? "contactless" : "normal";
    return {
      id, section: 9, feature: "vendorbulk.rows", kind: "bulk", tier: created ? "creates" : "safe", requires,
      title: isVolume
        ? `${rows.length} vendors in one sheet — every kind of row mixed (${label} workspace)`
        : `Field combinations, ${rows.length} vendor${rows.length > 1 ? "s" : ""} in one sheet (${label} workspace, sheet ${si + 1} of ${cut.length - 1})`,
      type: "Functional", priority: "P1", severity: "High",
      why: `Field combinations for a ${where}. Across these sheets: every pair of accepted column values together, every rejected value on its own, and every pair of rejected values (which message wins). Each row's answer comes from the deployed row check (tax → mandatory → PAN → Deals In → email → POC 2 email → profile → Status → onboarding → city) and the worker. This sheet: ${created} row(s) create a QA test vendor; ${tripped} row(s) that would have emailed real people carry a tripwire instead.`,
      steps: ["Upload the sheet", "Compare every row with its expected answer, in order", "For created rows, find the vendor in the tab named"],
      sheet: { rows: rows.map((r) => r.cells) },
      rows: rows.map((r) => r.expect),
      expected: `Row by row as listed in the checklist's 'Row-by-row' sheet. ${created} created, ${rows.length - created} failed.`,
      oracle: "Every job row's status and message; the vendor's tab for created rows.",
      rule: "PR16267 @ab282ab7e3 app/services/validations/vendor_bulk_upload_validation_service_v2.rb:21-85; app/workers/vendor_bulk_upload_worker_v2.rb:66-160",
      combo: rows.map((r, i) => ({
        row: i + 4,
        values: `[${r.kind}${r.faults.length ? `: ${r.faults.join(" + ")}` : ""}] ${r.describe}`,
        expected: r.outcome.created && !r.outcome.workerError
          ? `Completed — the vendor lands in ${r.outcome.tab === "active" ? "Vendors (active)" : r.outcome.tab === "rejected" ? "Rejected" : "Prospects"}`
          : `Failed — “${r.outcome.error ?? r.outcome.workerError}”${r.outcome.created && r.outcome.workerError?.includes(MSG.POC2) ? " (today the vendor is created anyway, BUG-07)" : ""}`,
        tripwire: r.tripwire ? `${r.tripwire} = QA_TRIPWIRE (this row would otherwise ${r.tripwire === "Status" ? "create a Prospect and email the vendor-management team" : "email the vendor-management team or leave a user with no email"})` : "",
        notes: r.outcome.notes.join("; "),
      })),
    } as VbuCase;
  });
}

/** What the combination sheets cover, for the report. */
export function comboCoverage(client: Client, MSG: Record<string, string>): Record<string, number> {
  return buildPlan(client, factorsFor(client), MSG).stats;
}
