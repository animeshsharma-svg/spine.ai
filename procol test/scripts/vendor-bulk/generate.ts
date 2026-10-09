/**
 * Generate every vendor-bulk-upload artefact from spec.ts.
 *
 *   npx tsx scripts/vendor-bulk/generate.ts
 *
 * Writes nothing outside this repo and the two sibling folders named below;
 * touches no database and calls no API.
 */
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildWorkbook, VBU_FIXTURE_DIR } from "../../src/flows/vendorBulkUpload.js";
import { CASES, QA_DOC, SECTIONS, backfillBaselineRow, cityZeroBaselineRow, dedupBaselineRow, fallbackBaselineRow, noPincodeBaselineRow, prospectBaselineRow, rejectedDupBaselineRow, subsidiaryBaselineRow, vrpBaselineRow, type VbuCase } from "./spec.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..", "..", "..");
const CASES_JSON = join(ROOT, "prototype", "data", "api-cases-extra", "vbu.json");
const HUMAN_MD = join(ROOT, "test-cases", "api-vendor-bulk.md");
const INTRO_MD = join(here, "doc-intro.md");

export const fixtureName = (c: VbuCase): string | null => {
  if (c.rawFixture) return `${c.id}.${c.rawFixture.ext}`;
  if (c.sheet) return `${c.id}.${c.sheet.bookType === "xls" ? "xls" : "xlsx"}`;
  return null;
};
export const BASELINE_FIXTURE = "VBU-DUP-BASE.xlsx";
export const CITYZERO_FIXTURE = "VBU-CITYZERO-BASE.xlsx";
const BASELINES: Record<string, { file: string; row: () => Record<string, unknown>; what: string }> = {
  dedup: { file: "VBU-DUP-BASE.xlsx", row: dedupBaselineRow, what: "the vendor every duplicate case compares against" },
  cityZero: { file: "VBU-CITYZERO-BASE.xlsx", row: cityZeroBaselineRow, what: "a vendor stored with city_id 0 (unknown city) and a tax number" },
  subsidiary: { file: "VBU-SUB-BASE.xlsx", row: subsidiaryBaselineRow, what: "the vendor whose contact email VBU-131 reuses" },
  prospect: { file: "VBU-PROSPECT-BASE.xlsx", row: prospectBaselineRow, what: "a contactless Prospect (no email, no invitation)" },
  fallback: { file: "VBU-FALLBACK-BASE.xlsx", row: fallbackBaselineRow, what: "the vendor the old-rule duplicate cases compare against" },
  noPincode: { file: "VBU-NOPIN-BASE.xlsx", row: noPincodeBaselineRow, what: "a legacy-style vendor with no pincode (VBU-213)" },
  backfill: { file: "VBU-BACKFILL-BASE.xlsx", row: backfillBaselineRow, what: "the vendor a blank-address row is back-filled from (VBU-214)" },
  rejectedDup: { file: "VBU-REJ-BASE.xlsx", row: rejectedDupBaselineRow, what: "a rejected vendor that must still block duplicates (VBU-215)" },
  vrp: { file: "VBU-VRP-BASE.xlsx", row: vrpBaselineRow, what: "a vendor with a VRP Code and its own Vendor Code (VBU-216/217/218)" },
};
/** QA-doc refs per case, from the QA_DOC map (plus any set on the case itself). */
const qaDocOf = (c: VbuCase): string[] => [...new Set([...(c.qaDoc ?? []), ...Object.entries(QA_DOC).filter(([, v]) => v.cases.includes(c.id)).map(([k]) => k)])];

function requiresText(c: VbuCase): string {
  const r = c.requires ?? {};
  const parts: string[] = [];
  const onOff = (v: boolean) => (v ? "is on" : "is off");
  if (r.contactless !== undefined) parts.push(`allow_contactless_vendor_upload ${onOff(r.contactless)}`);
  if (r.canSkip !== undefined) parts.push(`can_skip_vendor_onboarding ${onOff(r.canSkip)} (with vendor_onboarding_version v2)`);
  if (r.invitationV2 !== undefined) parts.push(`vendor_invitation_v2 ${onOff(r.invitationV2)}`);
  if (r.onboardingV2 !== undefined) parts.push(`vendor_onboarding_version ${r.onboardingV2 ? "is v2" : "is not v2"}`);
  if (r.disableManual !== undefined) parts.push(`disable_manual_vendor_creation ${onOff(r.disableManual)}`);
  if (r.dupFieldsInclude) parts.push(`vendor_duplicate_check_fields lists ${r.dupFieldsInclude.join(", ")}`);
  if (r.sameGstMulti !== undefined) parts.push(`allow_same_gst_multiple_addresses_vendor_invite ${onOff(r.sameGstMulti)}`);
  if (r.extraField === "__custom_profiles__") parts.push("vendor_category_type_mapping defines the workspace's own profiles");
  else if (r.extraField) parts.push(`extra_fields_for_vendor_invite has a '${r.extraField}' column`);
  if (r.requiredExtraFields) parts.push("extra_fields_for_vendor_invite has at least one is_required field");
  return parts.join("; ");
}

const tierText: Record<string, string> = {
  safe: "creates nothing (every row stops in validation)",
  creates: "creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com",
  "real-mail": "creates a Prospect — the backend emails the workspace's vendor-management team (real people on the sandbox); runs only with realMail=1",
};

/** error-sheet cases that upload a sheet first and read that job's error sheet */
const uploadsFirst = (c: VbuCase) => c.errorSheetCheck === "realJob" || c.errorSheetCheck === "profileDropdown";

function toRunnable(c: VbuCase): Record<string, unknown> {
  const pre = [requiresText(c), `Data: ${tierText[c.tier]}.`, c.setup].filter(Boolean).join(" ");
  const common = {
    id: c.id,
    feature: c.feature,
    title: c.title,
    type: c.type === "Performance" ? "Edge" : c.type,
    priority: c.priority,
    severity: c.severity,
    preconditions: pre,
    steps: c.steps,
    expectedResult: `${c.expected} Rule: ${c.rule}.`,
    rationale: c.why,
    qaDoc: qaDocOf(c),
    rule: c.rule,
    ...(c.disagree ? { disagree: c.disagree } : {}),
    tier: c.tier,
    ...(c.combo ? { combo: c.combo } : {}),
  };
  if (c.kind === "manual" || c.verdict === "manual") {
    // A body of its own, so the library never mistakes it for another case's request.
    return { ...common, method: "POST", path: "/v1/bulk_create_vendor", body: { manual_case: c.id }, expected: "no-5xx", notRunnable: `Manual case — ${c.manualReason ?? "described for a person, not automated"}` };
  }
  if (c.kind === "http") {
    return {
      ...common,
      method: c.method,
      path: c.path,
      ...(c.method === "GET" ? {} : { body: c.body }),
      expected: c.httpExpected,
      expectedResult:
        c.httpExpected === "reject" && c.httpMessage
          ? `${c.expected} Message '${c.httpMessage}'. Rule: ${c.rule}.`
          : common.expectedResult,
      bulk: { kind: "http", tier: c.tier, requires: c.requires ?? {}, actor: c.actor },
    };
  }
  const path =
    c.kind === "manualInvite" ? "/invitations/send_invite" :
    c.kind === "template" ? "/v1/bulk_create_vendor_template" :
    c.kind === "errorSheet" && !uploadsFirst(c) ? "/v1/bulk_create_vendor_error_sheet" :
    "/v1/bulk_create_vendor";
  const method = c.kind === "template" || (c.kind === "errorSheet" && !uploadsFirst(c)) ? "GET" : "POST";
  return {
    ...common,
    method,
    path,
    ...(method === "POST" ? { body: c.kind === "manualInvite" ? { manual_invite: c.id } : { excel_data: "{{vbuSheet}}", ...(c.extraBody ?? {}) } } : {}),
    // The bulk runner decides the verdict itself; this is only what the generic
    // gate needs to let the request through untouched.
    expected: "accept",
    bulk: {
      kind: c.kind,
      tier: c.tier,
      requires: c.requires ?? {},
      fixture: fixtureName(c),
      wrap: c.wrap,
      refuse: c.refuse,
      rows: c.rows,
      anyOrder: c.anyOrder,
      statusCounts: c.statusCounts,
      // several baselines are uploaded in order, comma-separated
      baseline: c.baseline ? [c.baseline].flat().map((b) => BASELINES[b].file).join(",") : undefined,
      actor: c.actor,
      payload: c.payload,
      fixture2: c.sheet2 ? `${c.id}-b.xlsx` : undefined,
      inviteBody: c.inviteBody,
      inviteExpect: c.inviteExpect,
      templateCheck: c.templateCheck,
      errorSheetCheck: c.errorSheetCheck,
      everyRow: c.id === "VBU-023" || (c.combo?.length ?? 0) >= 50,
    },
  };
}

function humanCase(c: VbuCase): string {
  const hid = c.id.replace("VBU-", "API-XVBU-");
  const verdict = c.verdict === "manual" || c.kind === "manual" ? "manual" : "automate";
  const fx = fixtureName(c);
  const setupBits = [
    requiresText(c) ? `gate: ${requiresText(c)}.` : "",
    `Data: ${tierText[c.tier]}.`,
    c.setup ?? "",
    fx ? `Fixture: \`procol test/fixtures/vendor-bulk-upload/${fx}\`.` : "",
    c.manualReason ? `Not automated: ${c.manualReason}` : "",
  ].filter(Boolean);
  const lines = [
    `#### ${hid} — ${c.title}`,
    `- **Why it matters.** ${c.why}`,
    `- **Setup.** ${setupBits.join(" ")}`,
    `- **Steps.** ${c.steps.map((s, i) => `${i + 1}. ${s}`).join(" ")}`,
    `- **Expected.** ${c.expected}`,
    `- **Oracle.** ${c.oracle}`,
  ];
  if (c.disagree) lines.push(`- **Spec vs code.** ${c.disagree}`);
  const qa = qaDocOf(c);
  if (qa.length) lines.push(`- **QA doc.** Covers ${qa.join(", ")} of the PR's QA document.`);
  lines.push(`- **Trace.** ${c.priority} · ${verdict} · \`${c.id}\` · \`${c.rule}\``);
  return lines.join("\n");
}

function main() {
  // fixtures
  if (existsSync(VBU_FIXTURE_DIR)) {
    for (const f of readdirSync(VBU_FIXTURE_DIR)) if (/^VBU-/.test(f)) rmSync(join(VBU_FIXTURE_DIR, f));
  }
  mkdirSync(VBU_FIXTURE_DIR, { recursive: true });
  const manifest: string[] = [
    "# Vendor bulk upload fixtures",
    "",
    "Generated by `npx tsx scripts/vendor-bulk/generate.ts` from `scripts/vendor-bulk/spec.ts` — do not edit by hand.",
    "Cells hold literal `{{stamp}}`, `{{gst}}`, `{{profile}}` … tokens; the runner fills them per run, so every",
    "vendor is `QA_Platform_VBU_<stamp>_…` with a `qa_vbu_<stamp>_…@example.com` contact and a fake GSTIN whose",
    "PAN part carries entity letter Z (no real PAN has it). Layout: rows 1–2 group headers, row 3 column names,",
    "data from row 4, as the backend reads it.",
    "",
    "| File | Case | Rule broken (and tripwire) | Data |",
    "| --- | --- | --- | --- |",
  ];
  let written = 0;
  for (const c of CASES) {
    const name = fixtureName(c);
    if (!name) continue;
    const bytes = c.rawFixture ? c.rawFixture.bytes() : buildWorkbook(c.sheet!);
    writeFileSync(join(VBU_FIXTURE_DIR, name), bytes);
    written++;
    if (c.sheet2) { writeFileSync(join(VBU_FIXTURE_DIR, `${c.id}-b.xlsx`), buildWorkbook(c.sheet2)); written++; }
    manifest.push(`| \`${name}\` | ${c.id} | ${c.title.replace(/\|/g, "/")} | ${c.tier} |`);
  }
  for (const [k, b] of Object.entries(BASELINES)) {
    writeFileSync(join(VBU_FIXTURE_DIR, b.file), buildWorkbook({ rows: [b.row() as any] }));
    manifest.push(`| \`${b.file}\` | ${k} baseline | ${b.what} | creates |`);
    written++;
  }
  writeFileSync(join(VBU_FIXTURE_DIR, "README.md"), manifest.join("\n") + "\n");

  // runnable cases
  mkdirSync(dirname(CASES_JSON), { recursive: true });
  writeFileSync(CASES_JSON, JSON.stringify(CASES.map(toRunnable), null, 2) + "\n");

  // the QA-doc map, for the report's "Against the QA document" table
  writeFileSync(join(ROOT, "prototype", "config", "vbuQaDoc.json"), JSON.stringify(QA_DOC, null, 1) + "\n");

  // human cases
  const intro = existsSync(INTRO_MD) ? readFileSync(INTRO_MD, "utf8").trimEnd() + "\n\n" : "";
  const parts: string[] = [intro];
  for (const [n, title] of Object.entries(SECTIONS)) {
    const inSection = CASES.filter((c) => c.section === Number(n));
    if (!inSection.length) continue;
    parts.push(`## ${n}. ${title}\n`);
    for (const c of inSection) parts.push(humanCase(c) + "\n");
  }
  writeFileSync(HUMAN_MD, parts.join("\n").replace(/\n{3,}/g, "\n\n"));

  const byTier = CASES.reduce<Record<string, number>>((a, c) => ((a[c.tier] = (a[c.tier] ?? 0) + 1), a), {});
  const manual = CASES.filter((c) => c.kind === "manual" || c.verdict === "manual").length;
  console.log(`${CASES.length} cases (${manual} manual) · ${written} fixtures · tiers ${JSON.stringify(byTier)}`);
  console.log(`→ ${CASES_JSON}\n→ ${HUMAN_MD}\n→ ${VBU_FIXTURE_DIR}`);
}

main();
