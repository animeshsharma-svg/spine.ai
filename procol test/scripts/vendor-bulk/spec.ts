/**
 * VENDOR BULK UPLOAD — the one list every artefact is generated from.
 *
 *   npx tsx scripts/vendor-bulk/generate.ts
 *
 * writes, from this file alone:
 *   fixtures/vendor-bulk-upload/*          one file per case (one rule broken per file)
 *   ../prototype/data/api-cases-extra/vbu.json   the runnable cases
 *   ../test-cases/api-vendor-bulk.md             the human cases
 * so the sheet a person opens, the case the platform runs and the case a
 * tester reads can never say different things.
 *
 * THE TRIPWIRE. A negative row that the product wrongly accepts would create a
 * vendor, and on an onboarding workspace a vendor that needs onboarding emails
 * the client's vendor-management team. So every row-rule fixture also carries a
 * value that fails a LATER check in the validator's fixed order
 * (app/services/validations/vendor_bulk_upload_validation_service_v2.rb:19-78):
 *   tax → mandatory → Deals In → email → email 2 → profile → STATUS → onboarding → city.
 * Status = "QA_TRIPWIRE" fails at step 7. If the rule under test fires, its own
 * message comes back; if it does not, the row still stops at "Invalid Status" and
 * nothing is created. "Invalid Status" therefore reads as "every earlier rule let
 * this row through" — which is exactly the assertion for the positive checks.
 * Rows that must pass validation (to reach the worker) use
 * "Vendor Onboarding Required = No" (vendor lands Active, the only mail goes to
 * the qa_…@example.com address) or Status = rejected (no mail at all).
 */
import type { SheetSpec, Cell } from "../../src/flows/vendorBulkUpload.js";

export type Tier = "safe" | "creates" | "real-mail";
/** a vendor that must exist before the case runs (uploaded once per run) */
export type Baseline = "dedup" | "cityZero" | "subsidiary" | "prospect" | "fallback" | "noPincode" | "backfill" | "rejectedDup" | "vrp";
export type Feature =
  | "vendorbulk.file"
  | "vendorbulk.access"
  | "vendorbulk.rows"
  | "vendorbulk.onboarding"
  | "vendorbulk.dedup"
  | "vendorbulk.data"
  | "vendorbulk.settings";

/** Workspace facts a case depends on. Resolved from the DB before a run (SELECT only). */
export interface Requires {
  contactless?: boolean; // allow_contactless_vendor_upload
  canSkip?: boolean; // can_skip_vendor_onboarding (only counts with onboarding v2)
  invitationV2?: boolean; // vendor_invitation_v2
  onboardingV2?: boolean; // vendor_onboarding_version == v2
  disableManual?: boolean; // disable_manual_vendor_creation
  dupFieldsInclude?: string[]; // vendor_duplicate_check_fields must list these
  sameGstMulti?: boolean; // allow_same_gst_multiple_addresses_vendor_invite
  extraField?: string; // extra_fields_for_vendor_invite must have this column name
  requiredExtraFields?: boolean; // some extra field is is_required
  dupFieldsEmpty?: boolean; // vendor_duplicate_check_fields absent or []
  /** vendor_duplicate_check_fields is set but unusable in this way */
  dupFieldsState?: "no-anchor" | "unknown-field";
}

export interface Verify {
  /** buyer_seller_company_mappings.status — the tab the vendor lands in */
  bscm?: "active" | "invited" | "rejected" | "onboarding_in_progress";
  /** how many invitation rows the vendor got */
  invitations?: number;
  invitationStatus?: "active" | "accepted" | "rejected";
  skipOnboarding?: boolean;
  /** column → exact stored value (vars filled): gst_no, pan_no, address, city, misc.<key>, vendor_code, name */
  fields?: Record<string, string | null>;
  /** at least one invitation must be a subsidiary invitation */
  subsidiary?: boolean;
  /** at least this many user_company_mappings on the vendor */
  minUsers?: number;
  /** the vendor must NOT exist afterwards */
  absent?: boolean;
  /** how many category teams (Deals In) the vendor ends up in */
  teams?: number;
}

export interface RowExpect {
  status: "failed" | "success" | "already_mapped";
  /** exact error text */
  error?: string;
  /** error must contain this */
  errorIncludes?: string;
  /** job row data[key] after parsing must equal this (vars filled) */
  dataEquals?: Record<string, string>;
  /** job row data[key] must NOT contain this */
  dataExcludes?: Record<string, string>;
  verify?: Verify;
}

export interface VbuCase {
  id: string; // VBU-NNN → human API-XVBU-NNN
  section: number;
  feature: Feature;
  title: string;
  type: "Functional" | "Validation" | "Boundary" | "Edge" | "Security" | "Negative" | "Performance";
  priority: "P0" | "P1" | "P2" | "P3";
  severity: "Critical" | "High" | "Medium" | "Low";
  tier: Tier;
  requires?: Requires;
  why: string;
  setup?: string;
  steps: string[];
  /** plain-words expected result: status + message */
  expected: string;
  oracle: string;
  /** file:line of the rule */
  rule: string;
  /** where the written spec (QA doc / lead) and the code disagree */
  disagree?: string;
  /** manual = described for a person, not run */
  verdict?: "automate" | "manual";
  manualReason?: string;

  kind:
    | "http" | "bulk" | "template" | "errorSheet" | "formulaSheet" | "manual"
    /** two sheets uploaded at the same moment by the same user */
    | "concurrent"
    /** upload, download the job's error sheet, upload that back */
    | "errorSheetReupload"
    /** the single-vendor Invite Vendor call (POST /invitations/send_invite) */
    | "manualInvite"
    /** download the workspace's template and upload it as it is (Status tripwired) */
    | "templateUpload";
  /** which QA-doc case(s) this covers (the PR's "Vendor bulk upload + dedup — QA test cases") */
  qaDoc?: string[];
  /** who makes the request: the workspace admin (default), a QA test vendor, or a member without company:create_record */
  actor?: "seller-qa" | "member-no-company-create";
  /** body extras resolved when the case runs */
  payload?: "onboarding";
  /** kind concurrent: the second sheet */
  sheet2?: SheetSpec;
  /** kind manualInvite: the request body ({{vars}} filled) and what must happen */
  inviteBody?: Record<string, unknown>;
  inviteExpect?: { http: "accept" | "reject"; message?: string; verify?: Verify };
  // http: a plain request with no fixture
  method?: "GET" | "POST";
  path?: string;
  body?: unknown;
  httpExpected?: "accept" | "reject" | "no-5xx";
  httpMessage?: string;
  // bulk: a fixture uploaded, then its rows read back
  sheet?: SheetSpec;
  /** a non-spreadsheet fixture, written as-is */
  rawFixture?: { ext: string; bytes: () => Buffer };
  /** body extras sent next to excel_data */
  extraBody?: Record<string, unknown>;
  /** how excel_data is wrapped: prefix a data URL, etc. */
  wrap?: "dataUrl";
  /** when the upload itself must be refused: the message it must carry */
  refuse?: { message?: string; code?: string };
  rows?: RowExpect[];
  /** rows may come back in any order (parallel workers) */
  anyOrder?: boolean;
  /** what the Bulk Upload history (GET /v1/bulk_create_vendor_status) must count for the job */
  statusCounts?: { total?: number; success?: number; failed?: number; already_mapped?: number };
  /** a baseline sheet that must have been uploaded (and succeeded) first, once per run */
  baseline?: Baseline | Baseline[];
  /** kind template: which assertion */
  templateCheck?: "headers" | "sampleAligned" | "dropdowns" | "dimension" | "dataSheet" | "groups";
  /** kind errorSheet: which variant */
  errorSheetCheck?: "noJob" | "unknownJob" | "realJob" | "profileDropdown";
}

// ── building blocks ──────────────────────────────────────────────────────

const S = "{{stamp}}";
export const vName = (id: string, tail = "") => `QA_Platform_VBU_${S}_${id.replace("VBU-", "")}${tail}`;
export const vEmail = (id: string, n = 1) => `qa_vbu_${S}_${id.replace("VBU-", "").toLowerCase()}_${n}@example.com`;

export const MSG = {
  MAND: "Mandatory Item cannot be left empty",
  EITHER: "Either Tax No. or Without Tax No. fields are needed",
  TAXINV: "Invalid Tax No.",
  TAXCFG: "Tax Type not configured for the selected Business Location",
  DEALS: "Invalid Deals In : ",
  EMAIL: "Invalid Email",
  EMAIL2: "Invalid Email 2",
  PROFILE: "Invalid Vendor Profile",
  STATUS: "Invalid Status",
  ONB: "Invalid Vendor Onboarding Required. Choose Yes or No from the dropdown",
  CITY: "Invalid City Name",
  VCODE: "Invalid Value for Vendor Code.",
  POC2: "Invalid Values for POC 2.",
  DUP_ADDR: "Vendor with this GST and address already exists",
  CODE_TAKEN: "Vendor Code or GST Number is already taken",
  INVITED: "This email is already invited.",
  NONAME: "POC name is not present",
  OLD_FORMAT: "Format is updated for bulk upload, please download the format to continue.",
  BAD_FILE: "Invalid file format",
  INSUFFICIENT: "Insufficient parameters",
  MANUAL_OFF: "Manual vendor creation is disabled",
};

export const TRIP_STATUS = "QA_TRIPWIRE";
export const TRIP_ONB = "QA_TRIPWIRE";

/** A row that passes every rule (GMMCO) — the starting point every case changes one thing in. */
export function baseRow(id: string, n = 1): Record<string, Cell> {
  return {
    "Company Name": vName(id, n > 1 ? `_${n}` : ""),
    "Vendor Profile": "{{profile}}",
    "POC - Full Name": "QA Platform Tester",
    "POC - Email Address": vEmail(id, n),
    City: "Mumbai",
    Address: "QA Test Street 1",
    "Vendor Onboarding Required": "No",
  };
}
/** baseRow + the Status tripwire + the change under test. */
export const trip = (id: string, change: Record<string, Cell>, n = 1): Record<string, Cell> => ({
  ...baseRow(id, n),
  Status: TRIP_STATUS,
  ...change,
});
/** For the Status rule itself the tripwire moves one step later, to the onboarding column. */
export const tripOnb = (id: string, change: Record<string, Cell>): Record<string, Cell> => ({
  ...baseRow(id),
  "Vendor Onboarding Required": TRIP_ONB,
  ...change,
});

/** PROCOL DEMO (198678) makes four extra columns mandatory; its rows must carry them. */
export const PD_REQUIRED: Record<string, Cell> = {
  "Feedback Score": "5",
  "Feedback Report": "https://example.com/qa-feedback.pdf",
  "Contact Number": "0000000001", // not a valid Indian mobile on purpose
  "Non-PQ Remark": "QA platform test row",
};

const one = (row: Record<string, Cell>, extra: Partial<SheetSpec> = {}): SheetSpec => ({ rows: [row], ...extra });
const tripped = (): RowExpect[] => [{ status: "failed", error: MSG.STATUS }];
const fails = (error: string): RowExpect[] => [{ status: "failed", error }];

const R = {
  ctrl: "app/controllers/api/v1/companies_controller.rb",
  helper: "app/helpers/api/companies_helper.rb",
  parse: "app/services/conversions/excel_to_json_conversion_service.rb",
  sheet: "lib/excel_sheet_utils.rb",
  utils: "app/controllers/concerns/utils.rb",
  val: "app/services/validations/vendor_bulk_upload_validation_service_v2.rb",
  wrk: "app/workers/vendor_bulk_upload_worker_v2.rb",
  send: "app/services/invitation/send_service.rb",
  vpc: "app/services/vpc_network/create_service.rb",
  mixin: "app/services/vpc_network/concerns/vpc_params_mixin.rb",
  sub: "app/services/vpc_network/subsidiary_service.rb",
  inv: "app/models/invitations.rb",
  bscm: "app/models/buyer_seller_company_mapping.rb",
  tpl: "app/services/procol_excel/vendor_bulk_upload_excel_service_v2.rb",
  pol: "app/policies/company_policy.rb",
  city: "app/models/city.rb",
  co: "app/models/company.rb",
  loc: "config/locales/en-IN.yml",
  ui: "procol-client-dashboard/src/views/vendorBulkUpload/uploadExcelModal.jsx",
  /** PR 16267 head 65728150bc (fetched 2026-09-29; deployed on the sandbox) */
  pr: "PR 16267 @65728150bc",
  prVal: "PR16267 app/services/validations/vendor_bulk_upload_validation_service_v2.rb",
  prUtils: "PR16267 app/controllers/concerns/utils.rb",
  prSend: "PR16267 app/services/invitation/send_service.rb",
  prDup: "PR16267 app/services/vendors/duplicate_check_fields.rb",
  prMixin: "PR16267 app/services/vpc_network/concerns/vpc_params_mixin.rb",
  prTpl: "PR16267 app/services/procol_excel/vendor_bulk_upload_excel_service_v2.rb",
};

// tiny fake files for the "not a spreadsheet" cases
const PDF = () => Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
const PNG = () =>
  Buffer.from(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
      "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082",
    "hex",
  );
const CSV = () =>
  Buffer.from(
    "Company Name,Vendor Profile,POC - Full Name,POC - Email Address,City,Address,Status,Vendor Onboarding Required\n" +
      `QA_Platform_VBU_${S}_csv,{{profile}},QA Platform Tester,qa_vbu_${S}_csv@example.com,Mumbai,QA Test Street 1,${TRIP_STATUS},No\n`,
  );
/** A real OOXML zip that is a Word document, not a workbook. */
const DOCX = () =>
  Buffer.from(
    "UEsDBBQAAAAIAAAAIQDfpNJsWgEAACAFAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbK2Uy07DMBBF" +
      "90j8Q+QtShxYIISSdMFjCSzKB5hkklj1S/a0tH/PuCmVQKGUx8ZSMvfeY98ZN1kvncVolUMy1Vzqbh" +
      "UuC9fL0spn1TRrMQnO7Z8BxJcNNLWbVn2j2lO5Nsx+U7H05YlQSwECFAAUAAAACAAAACEA36TSbFoBAA" +
      "AgBQAAEwAAAAAAAAAAAAAAAAAAAAAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLBQYAAAAAAQABAEEAAACLAQAAAAA=",
    "base64",
  );

const long = (n: number, fill = "A") => fill.repeat(n);

// ── the cases ────────────────────────────────────────────────────────────

export const SECTIONS: Record<number, string> = {
  1: "The request and the file itself",
  2: "Who may upload, and the template / status / error-sheet endpoints",
  3: "Row rules — every column",
  4: "What a row creates: Prospect vs Vendor, Status, POC 2",
  5: "Duplicates — inside one sheet and against existing vendors",
  6: "Data fidelity — what the parser does to the values",
  7: "Settings on other workspaces (regression)",
  8: "Found by the coverage audit, not run: they mail real people, change a workspace for good, need two workspaces in sequence, or need a setting no test client has",
};

export const CASES: VbuCase[] = [
  // ════════════ 1. the request and the file ════════════
  {
    id: "VBU-001", section: 1, feature: "vendorbulk.file", kind: "http", tier: "safe",
    title: "Upload with no excel_data is refused",
    type: "Negative", priority: "P1", severity: "Medium",
    why: "The only required parameter. An API client that forgets it must get a clean 422, never a 500 from decoding nil.",
    steps: ["POST /v1/bulk_create_vendor with body {}"],
    method: "POST", path: "/v1/bulk_create_vendor", body: {}, httpExpected: "reject", httpMessage: MSG.INSUFFICIENT,
    expected: "HTTP 422, error code 2 'Insufficient parameters'. No job rows are staged.",
    oracle: "422 + code 2; vendor_bulk_upload_jobs has no new row for this user.",
    rule: `${R.ctrl}:209`,
  },
  {
    id: "VBU-002", section: 1, feature: "vendorbulk.file", kind: "http", tier: "safe",
    title: "excel_data sent as null is refused",
    type: "Negative", priority: "P2", severity: "Low",
    why: "JSON null reaches Rails as nil — same guard as a missing key; proves the guard is `nil?` and not `key?`.",
    steps: ['POST /v1/bulk_create_vendor with body {"excel_data": null}'],
    method: "POST", path: "/v1/bulk_create_vendor", body: { excel_data: null }, httpExpected: "reject", httpMessage: MSG.INSUFFICIENT,
    expected: "HTTP 422, error code 2 'Insufficient parameters'.",
    oracle: "422 + code 2.", rule: `${R.ctrl}:209`,
  },
  {
    id: "VBU-003", section: 1, feature: "vendorbulk.file", kind: "http", tier: "safe",
    title: "excel_data as an empty string is refused cleanly",
    type: "Edge", priority: "P1", severity: "High",
    why: "The guard only catches nil. An empty string goes on to Base64-decode into a 0-byte temp file; Roo then has to fail on it without a 500.",
    steps: ['POST /v1/bulk_create_vendor with body {"excel_data": ""}'],
    method: "POST", path: "/v1/bulk_create_vendor", body: { excel_data: "" }, httpExpected: "reject", httpMessage: MSG.BAD_FILE,
    expected: "HTTP 422 'Invalid file format' (error 15 carrying messages.invalid_file_format). Never a 500.",
    oracle: "4xx with that message; any 5xx is a defect.",
    rule: `${R.ctrl}:209-211, ${R.sheet}:2-13`,
  },
  {
    id: "VBU-004", section: 1, feature: "vendorbulk.file", kind: "http", tier: "safe",
    title: "excel_data that is not base64 at all is refused",
    type: "Negative", priority: "P1", severity: "Medium",
    why: "Ruby's Base64.decode64 silently skips characters outside the alphabet, so garbage decodes to a few junk bytes instead of raising — the Roo fallback chain must still end in a clean refusal.",
    steps: ['POST /v1/bulk_create_vendor with body {"excel_data": "@@@ this is not base64 @@@"}'],
    method: "POST", path: "/v1/bulk_create_vendor", body: { excel_data: "@@@ this is not base64 @@@" }, httpExpected: "reject", httpMessage: MSG.BAD_FILE,
    expected: "HTTP 422 'Invalid file format'.", oracle: "4xx with that message; no 5xx.", rule: `${R.sheet}:4-11`,
  },
  {
    id: "VBU-005", section: 1, feature: "vendorbulk.file", kind: "bulk", tier: "safe",
    title: "A PDF renamed as a spreadsheet is refused",
    type: "Negative", priority: "P1", severity: "Medium",
    why: "File type is decided only by trying Excelx then Excel; a PDF must fall through both to the 'Invalid file format' branch.",
    steps: ["Base64 the fixture PDF", "POST /v1/bulk_create_vendor {excel_data}"],
    rawFixture: { ext: "pdf", bytes: PDF }, refuse: { message: MSG.BAD_FILE },
    expected: "HTTP 422 'Invalid file format'. No job staged.", oracle: "4xx + message; no job rows.", rule: `${R.sheet}:4-11`,
  },
  {
    id: "VBU-006", section: 1, feature: "vendorbulk.file", kind: "bulk", tier: "safe",
    title: "A PNG image is refused",
    type: "Negative", priority: "P2", severity: "Low",
    why: "Binary non-zip, non-OLE input — the second Roo fallback must raise Ole::Storage::FormatError, which is the only error the helper rescues there.",
    steps: ["Base64 a 1×1 PNG", "POST it as excel_data"],
    rawFixture: { ext: "png", bytes: PNG }, refuse: { message: MSG.BAD_FILE },
    expected: "HTTP 422 'Invalid file format'.", oracle: "4xx; no 5xx.", rule: `${R.sheet}:4-11`,
  },
  {
    id: "VBU-007", section: 1, feature: "vendorbulk.file", kind: "bulk", tier: "safe",
    title: "A CSV — which the upload screen lets you pick — is refused by the API",
    type: "Edge", priority: "P1", severity: "Medium",
    why: "The upload dialog's file picker accepts .csv, but the backend only opens xlsx/xls. A buyer can pick a CSV and get an error they cannot act on.",
    steps: ["Base64 a CSV with the right headers", "POST it as excel_data"],
    rawFixture: { ext: "csv", bytes: CSV }, refuse: { message: MSG.BAD_FILE },
    expected: "HTTP 422 'Invalid file format' — and the UI should not offer CSV in the first place.",
    oracle: "4xx with that message; UI accept list includes .csv (client bug).",
    rule: `${R.sheet}:4-11; ${R.ui}:124-128 (accept=".csv, …")`,
    disagree: "Client accepts .csv; backend cannot parse CSV.",
  },
  {
    id: "VBU-008", section: 1, feature: "vendorbulk.file", kind: "bulk", tier: "safe",
    title: "A Word .docx (a zip that is not a workbook) is refused without a 500",
    type: "Edge", priority: "P1", severity: "High",
    why: "A .docx is a valid zip, so Roo::Excelx gets further than with a PDF and can raise errors the helper does not rescue (only Zip::Error/ArgumentError are).",
    steps: ["Base64 a minimal docx", "POST it as excel_data"],
    rawFixture: { ext: "docx", bytes: DOCX }, refuse: { message: MSG.BAD_FILE },
    expected: "HTTP 422 'Invalid file format'. Any 5xx is a defect.", oracle: "4xx; no 5xx.", rule: `${R.sheet}:4-11`,
  },
  {
    id: "VBU-009", section: 1, feature: "vendorbulk.file", kind: "bulk", tier: "safe",
    title: "base64 with the data-URL prefix left on is refused cleanly",
    type: "Edge", priority: "P2", severity: "Low",
    why: "The web app strips 'data:…;base64,' before sending; any other client that forgets gets junk bytes in front of the zip.",
    steps: ["Take a valid tripwired sheet", "Prefix its base64 with data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,", "POST"],
    sheet: one(trip("VBU-009", {})), wrap: "dataUrl", refuse: {},
    expected: "A clean 4xx — 422 'Invalid file format', or the sandbox firewall's bare 403 (seen 2026-09-29); never a 500.",
    oracle: "4xx; no 5xx.", rule: `${R.sheet}:17-23; client strips at uploadExcelModal.jsx:57`,
  },
  {
    id: "VBU-010", section: 1, feature: "vendorbulk.file", kind: "bulk", tier: "safe",
    title: "The old sheet format (GST / POC - Phone Number columns) is refused",
    type: "Negative", priority: "P0", severity: "High",
    why: "Buyers still hold the pre-V2 template. The parser must refuse it outright instead of staging rows that all fail.",
    steps: ["Build a sheet whose row 3 has the V1 headers (Company Name, POC - Full Name, POC - Phone Number, POC - Email Address, Vendor Profile, GST, City, Address)", "POST"],
    sheet: {
      headers: ["Company Name", "POC - Full Name", "POC - Phone Number", "POC - Email Address", "Vendor Profile", "GST", "City", "Address"],
      rows: [{ "Company Name": vName("VBU-010"), "POC - Full Name": "QA Platform Tester", "POC - Phone Number": "0000000001", "POC - Email Address": vEmail("VBU-010"), "Vendor Profile": "{{profile}}", City: "Mumbai", Address: "QA Test Street 1" }],
    },
    refuse: { message: MSG.OLD_FORMAT },
    expected: "HTTP 422 'Format is updated for bulk upload, please download the format to continue.' No job staged.",
    oracle: "4xx + that message.", rule: `${R.parse}:164-167; ${R.loc}:506`,
  },
  {
    id: "VBU-011", section: 1, feature: "vendorbulk.file", kind: "bulk", tier: "safe",
    title: "A new-format sheet with just one old column (POC 2 - Mobile) is also refused",
    type: "Edge", priority: "P2", severity: "Low",
    why: "The old-format test is 'any one of three headers', so one leftover column rejects an otherwise current sheet — worth knowing when a buyer adds a column by hand.",
    steps: ["Current template headers + an extra 'POC 2 - Mobile' column", "POST"],
    sheet: one(trip("VBU-011", { "POC 2 - Mobile": "0000000001" })),
    refuse: { message: MSG.OLD_FORMAT },
    expected: "HTTP 422 'Format is updated for bulk upload, please download the format to continue.'",
    oracle: "4xx + that message.", rule: `${R.parse}:164`,
  },
  {
    id: "VBU-012", section: 1, feature: "vendorbulk.file", kind: "bulk", tier: "safe",
    title: "An empty workbook (no cells at all) is refused without a 500",
    type: "Edge", priority: "P0", severity: "High",
    why: "sheet.last_row is nil for an empty sheet and the loop compares 4 <= nil — an ArgumentError outside any rescue.",
    steps: ["Workbook with one sheet and no cells", "POST"],
    sheet: { layout: "emptyWorkbook" }, refuse: {},
    expected: "HTTP 422 with a clear message (e.g. 'no data rows'); never a 500.",
    oracle: "4xx; 5xx = defect.", rule: `${R.parse}:168-171`,
  },
  {
    id: "VBU-013", section: 1, feature: "vendorbulk.file", kind: "bulk", tier: "safe",
    title: "Headers only, no data rows, is refused with a message",
    type: "Edge", priority: "P1", severity: "Medium",
    why: "There is no empty-sheet rule: the upload answers success, the UI toasts 'Vendors Sheet Uploaded', and no job ever appears. The buyer cannot tell anything happened.",
    steps: ["The template's 3 header rows, nothing from row 4", "POST", "Read GET /v1/bulk_create_vendor_status"],
    sheet: { rows: [] }, refuse: {},
    expected: "HTTP 422 'no vendor rows found' (or similar). Today: HTTP 200 and nothing staged.",
    oracle: "Refusal expected; a 200 with zero staged rows is the defect.", rule: `${R.parse}:168-181; ${R.helper}:680-714 (no empty check)`,
  },
  {
    id: "VBU-014", section: 1, feature: "vendorbulk.file", kind: "bulk", tier: "safe",
    title: "A normal spreadsheet (headers on row 1) is refused with a message",
    type: "Edge", priority: "P1", severity: "Medium",
    why: "The parser always reads headers from row 3. A buyer who builds their own sheet with headers on row 1 gets row 3 (a data row) read as headers — silently.",
    steps: ["Headers on row 1, two tripwired data rows on rows 2-3", "POST"],
    sheet: { layout: "headerRow1", rows: [trip("VBU-014", {}), trip("VBU-014", {}, 2)] }, refuse: {},
    expected: "HTTP 422 telling the buyer to use the template. Today: 200 and nothing staged.",
    oracle: "Refusal expected; success with zero staged rows is the defect.", rule: `${R.parse}:168-170`,
  },
  {
    id: "VBU-015", section: 1, feature: "vendorbulk.file", kind: "bulk", tier: "safe",
    title: "A legacy .xls (BIFF8) file is parsed like an .xlsx",
    type: "Functional", priority: "P1", severity: "Medium",
    why: "The Roo::Excel fallback is the only path for .xls; it must hand the same row to the validator.",
    steps: ["Tripwired row saved as .xls", "POST", "Read the staged row"],
    sheet: one(trip("VBU-015", {}), { bookType: "xls" }), rows: tripped(),
    expected: "HTTP 200; one row, failed 'Invalid Status' (every rule before Status passed).",
    oracle: "Job row status failed, error 'Invalid Status'.", rule: `${R.sheet}:6-8`,
  },
  {
    id: "VBU-016", section: 1, feature: "vendorbulk.file", kind: "bulk", tier: "safe",
    title: "Columns in a different order are matched by name",
    type: "Functional", priority: "P1", severity: "Medium",
    why: "The QA doc warns that an old template 'puts values in the wrong columns'. The parser keys every cell by its header name, so order should not matter at all.",
    steps: ["Tripwired row with the columns reversed", "POST"],
    sheet: { headers: [...["Vendor Onboarding Required", "Status", "Address", "City", "POC - Email Address", "POC - Full Name", "Vendor Profile", "Company Name"]], rows: [trip("VBU-016", {})] },
    rows: tripped(),
    expected: "HTTP 200; row failed 'Invalid Status' (every value found under its own name).",
    oracle: "Job row error 'Invalid Status'.", rule: `${R.parse}:172-178`,
    disagree: "QA doc says a sheet downloaded before the flag change 'will put values in the wrong columns'; the parser maps by header name, so only a changed header NAME matters, not order.",
  },
  {
    id: "VBU-017", section: 1, feature: "vendorbulk.file", kind: "bulk", tier: "safe",
    title: "A header with a leading space (' Company Name') is still recognised",
    type: "Edge", priority: "P2", severity: "Low",
    why: "The parser rstrips headers (trailing spaces) but not leading ones, so a stray space in front silently empties the column.",
    steps: ["Rename the header to ' Company Name'", "Tripwired row", "POST"],
    sheet: { headers: [" Company Name", "Vendor Profile", "POC - Full Name", "POC - Email Address", "City", "Address", "Status", "Vendor Onboarding Required"], rows: [(() => { const r = trip("VBU-017", {}); r[" Company Name"] = r["Company Name"]; delete r["Company Name"]; return r; })()] },
    rows: tripped(),
    expected: "Row failed 'Invalid Status' (header trimmed on both sides). Today likely 'Mandatory Item cannot be left empty'.",
    oracle: "Job row error.", rule: `${R.parse}:177 (key.to_s.rstrip)`,
  },
  {
    id: "VBU-018", section: 1, feature: "vendorbulk.file", kind: "bulk", tier: "safe",
    title: "A header with a trailing space ('Company Name ') is recognised",
    type: "Edge", priority: "P3", severity: "Low",
    why: "Pins the rstrip that exists today.",
    steps: ["Rename the header to 'Company Name '", "Tripwired row", "POST"],
    sheet: { headers: ["Company Name ", "Vendor Profile", "POC - Full Name", "POC - Email Address", "City", "Address", "Status", "Vendor Onboarding Required"], rows: [(() => { const r = trip("VBU-018", {}); r["Company Name "] = r["Company Name"]; delete r["Company Name"]; return r; })()] },
    rows: tripped(),
    expected: "Row failed 'Invalid Status'.", oracle: "Job row error.", rule: `${R.parse}:177`,
  },
  {
    id: "VBU-019", section: 1, feature: "vendorbulk.file", kind: "bulk", tier: "safe",
    title: "Header names are case-sensitive ('company name' is not 'Company Name')",
    type: "Edge", priority: "P3", severity: "Low",
    why: "Documents the strictness: a lower-cased header is an unknown column, so Company Name is empty.",
    steps: ["Rename the header to 'company name'", "POST"],
    sheet: { headers: ["company name", "Vendor Profile", "POC - Full Name", "POC - Email Address", "City", "Address", "Status", "Vendor Onboarding Required"], rows: [(() => { const r = trip("VBU-019", {}); r["company name"] = r["Company Name"]; delete r["Company Name"]; return r; })()] },
    rows: fails(MSG.MAND),
    expected: "Row failed 'Mandatory Item cannot be left empty'.", oracle: "Job row error.", rule: `${R.val}:215-220`,
  },
  {
    id: "VBU-020", section: 1, feature: "vendorbulk.file", kind: "bulk", tier: "safe",
    title: "An unknown extra column is ignored",
    type: "Edge", priority: "P2", severity: "Low",
    why: "Buyers add notes columns. Unknown columns are passed straight through into the invite parameters, so they must at least not break validation.",
    steps: ["Tripwired row + a 'Remarks' column", "POST"],
    sheet: one(trip("VBU-020", { Remarks: "QA note" })), rows: tripped(),
    expected: "Row failed 'Invalid Status'.", oracle: "Job row error.", rule: `${R.utils}:877-884 (unknown keys copied as-is)`,
  },
  {
    id: "VBU-021", section: 1, feature: "vendorbulk.file", kind: "bulk", tier: "safe",
    title: "A blank row between two vendors is skipped, not reported as a failed vendor",
    type: "Edge", priority: "P1", severity: "Medium",
    why: "Every row up to last_row is staged, including empty ones, so the error sheet fills with 'failed' rows the buyer never wrote.",
    steps: ["Two tripwired rows with one empty row between them", "POST"],
    sheet: { rows: [trip("VBU-021", {}), trip("VBU-021", {}, 2)], gapsAfter: { 0: 1 } },
    rows: [{ status: "failed", error: MSG.STATUS }, { status: "failed", error: MSG.STATUS }],
    expected: "Exactly 2 staged rows, both failed 'Invalid Status'. Today a 3rd (blank) row is staged and failed.",
    oracle: "Count of staged rows = 2.", rule: `${R.parse}:171-181 (no blank-row skip)`,
  },
  {
    id: "VBU-022", section: 1, feature: "vendorbulk.file", kind: "bulk", tier: "safe",
    title: "The same column twice — the last copy wins",
    type: "Edge", priority: "P3", severity: "Low",
    why: "Two 'POC - Email Address' columns (a valid then an invalid one) collapse into one hash key; which one survives decides the error.",
    steps: ["Grid with two POC - Email Address columns, valid then invalid", "POST"],
    sheet: {
      layout: "grid",
      grid: [
        ["Mandatory Details"], ["", "With Tax No."],
        ["Company Name", "Vendor Profile", "POC - Full Name", "POC - Email Address", "POC - Email Address", "City", "Address", "Status", "Vendor Onboarding Required"],
        [vName("VBU-022"), "{{profile}}", "QA Platform Tester", vEmail("VBU-022"), "not-an-email", "Mumbai", "QA Test Street 1", TRIP_STATUS, "No"],
      ],
    },
    rows: fails(MSG.EMAIL),
    expected: "Row failed 'Invalid Email' (the second, invalid value was used). Behaviour to document, not a defect.",
    oracle: "Job row error.", rule: `${R.parse}:175-178`,
  },
  {
    id: "VBU-023", section: 1, feature: "vendorbulk.file", kind: "bulk", tier: "safe",
    title: "1,000 rows upload within the request and every row is processed",
    type: "Performance", priority: "P1", severity: "High",
    why: "Parsing and the staging insert happen inside the web request (the PR doc warns about an 11,000-row load). 1,000 tripwired rows measure it without creating anything.",
    steps: ["1,000 tripwired rows", "POST and time it", "Wait until no row is in_progress"],
    sheet: { rows: Array.from({ length: 1000 }, (_, i) => trip("VBU-023", {}, i + 1)) },
    rows: [{ status: "failed", error: MSG.STATUS }], // checked for every row by the runner
    expected: "HTTP 200 in well under 60 s; all 1,000 rows end failed 'Invalid Status'; none left in_progress.",
    oracle: "HTTP time, staged count 1000, every error 'Invalid Status'.", rule: `${R.ctrl}:210-213; ${R.helper}:680-714`,
  },

  {
    id: "VBU-024", section: 1, feature: "vendorbulk.file", kind: "concurrent", tier: "safe",
    title: "Two uploads by the same user at the same moment get separate jobs", type: "Edge", priority: "P1", severity: "Medium",
    why: "The job id is 'this user's job count + 1', read before the insert, so two uploads at the same time can share an id — their rows, status and error sheet then mix.",
    steps: ["POST two different tripwired sheets at the same moment", "Read the job id of every staged row"],
    sheet: one(trip("VBU-024", {})), sheet2: one(trip("VBU-024", {}, 2)),
    rows: [{ status: "failed", error: MSG.STATUS }, { status: "failed", error: MSG.STATUS }],
    expected: "Two jobs with one row each. Today the two rows can land in one job id.", oracle: "vendor_bulk_upload_jobs.job_id of both rows.",
    rule: `${R.helper}:684`,
  },

  // ════════════ 2. access + template / status / error sheet ════════════
  {
    id: "VBU-030", section: 2, feature: "vendorbulk.access", kind: "template", tier: "safe", templateCheck: "headers",
    title: "The template carries every column this workspace needs",
    type: "Functional", priority: "P0", severity: "High",
    why: "The template is generated per workspace from its settings (extra fields, can-skip, contactless). A missing column means a rule a buyer can never satisfy.",
    steps: ["GET /v1/bulk_create_vendor_template", "Download excel_url", "Read row 3"],
    expected: "HTTP 200; row 3 lists Company Name, Tax Type, Tax No., Business Location, City, Address, Vendor Profile, POC name/email, Vendor Code, VRP Code, PAN No., Pincode, POC 2 name/email, Deals In, Status, every extra field, and 'Vendor Onboarding Required' when onboarding can be skipped.",
    oracle: "Header list compared with the workspace settings.", rule: `${R.tpl}:101-113; ${R.prUtils}:792-848 (PAN No./Pincode at 813-814 for every workspace)`,
  },
  {
    id: "VBU-031", section: 2, feature: "vendorbulk.access", kind: "template", tier: "safe", templateCheck: "sampleAligned",
    title: "The template's sample row lines up with its headers",
    type: "Functional", priority: "P1", severity: "Medium",
    why: "The sample row is written by position from a fixed list in the flag-OFF order. When contactless moves columns, 'Procol Contact' lands under Tax Type and the email under Tax No. A buyer who edits the sample row uploads garbage.",
    steps: ["Download the template", "Compare row 4 with row 3"],
    expected: "Row 4: Company Name=Procol, POC - Full Name=Procol Contact, POC - Email Address=example@procol.in, City=Gurgaon, Address=Platina Tower.",
    oracle: "Cell-by-cell comparison.", rule: `${R.prTpl}:295-336 (sample written by position in the flag-OFF order; PR did not touch it)`,
  },
  {
    id: "VBU-032", section: 2, feature: "vendorbulk.access", kind: "template", tier: "safe", templateCheck: "dropdowns",
    title: "Each dropdown sits on its own column",
    type: "Functional", priority: "P1", severity: "Medium",
    why: "The Vendor Profile dropdown range is hard-coded to D4:D100 unless vendor_invitation_v2 is on; with the contactless layout D is Business Location, so D gets two conflicting lists and Vendor Profile gets none.",
    steps: ["Download the template", "Read the data-validation ranges from the sheet XML"],
    expected: "Vendor Profile list on the Vendor Profile column; Tax Type, Business Location, Status, Vendor Onboarding Required each on their own column; no column with two lists.",
    oracle: "sqref of each <dataValidation> vs the header position.", rule: `${R.prTpl}:97 (D4:D100 unless vendor_invitation_v2 — not updated for contactless), 263-282`,
  },
  {
    id: "VBU-033", section: 2, feature: "vendorbulk.access", kind: "template", tier: "safe", templateCheck: "dimension",
    title: "The template's declared range covers every column",
    type: "Edge", priority: "P3", severity: "Low",
    why: "The <dimension> of the generated sheet can end before the last columns; readers that trust it (SheetJS, some ERPs' importers) drop Bank IFSC Code and Vendor Onboarding Required.",
    steps: ["Download the template", "Compare <dimension ref> with the last used cell"],
    expected: "Declared range = the real range.", oracle: "ref string comparison.", rule: `${R.tpl}:21-85 (axlsx dimension)`,
  },
  {
    id: "VBU-034", section: 2, feature: "vendorbulk.access", kind: "template", tier: "safe", templateCheck: "dataSheet",
    title: "The Data Sheet offers this workspace's profiles and Yes/No for onboarding",
    type: "Functional", priority: "P2", severity: "Medium",
    why: "Vendor Profile values come from vendor_category_type_mapping (GMMCO: manufacturer_trader …) — not 'manufacturer/brokerage' as the QA doc says.",
    steps: ["Download the template", "Read the Data Sheet columns"],
    expected: "Vendor Profiles = the keys of vendor_category_type_mapping; Vendor Onboarding Required = Yes, No (when onboarding can be skipped); Status = rejected, active.",
    oracle: "Compared with the workspace settings.", rule: `${R.utils}:847-857; ${R.tpl}:121-142`,
    disagree: "QA doc: 'Valid values: Vendor Profile manufacturer or brokerage'. For GMMCO the valid values are manufacturer_trader, service_provider_contractor, transporter_Logistics_provider, liscening_supplier.",
  },
  {
    id: "VBU-035", section: 2, feature: "vendorbulk.access", kind: "template", tier: "safe", templateCheck: "groups", requires: { contactless: true },
    title: "With contactless on, only Company Name is in the Mandatory block",
    type: "Functional", priority: "P1", severity: "Medium",
    why: "The flag moves POC Name, POC Email and Vendor Profile out of the mandatory group; the template must show that, or buyers keep filling fields they don't need.",
    steps: ["Download the template", "Read the row-1 group of each column"],
    expected: "Mandatory Details: Company Name (+ the With Tax No. trio). POC - Full Name, POC - Email Address, Vendor Profile, City, Address under Optional Details.",
    oracle: "Row-1 grouping.", rule: `${R.prUtils}:800-848`,
  },
  {
    id: "VBU-036", section: 2, feature: "vendorbulk.access", kind: "http", tier: "safe",
    title: "The job status list answers for the caller",
    type: "Functional", priority: "P2", severity: "Low",
    why: "The page polls this every 30 s while a job runs; it must answer with the job counters.",
    steps: ["GET /v1/bulk_create_vendor_status"],
    method: "GET", path: "/v1/bulk_create_vendor_status", httpExpected: "accept",
    expected: "HTTP 200 with jobs[] {job_uuid, success, failed, in_progress, already_mapped, total, created_at}.",
    oracle: "200.", rule: `${R.ctrl}:247-270`,
  },
  {
    id: "VBU-037", section: 2, feature: "vendorbulk.access", kind: "errorSheet", tier: "safe", errorSheetCheck: "noJob",
    title: "Error sheet without a job id is refused",
    type: "Negative", priority: "P2", severity: "Low",
    why: "job_id is required; the guard must answer 422, not 500.",
    steps: ["GET /v1/bulk_create_vendor_error_sheet (no job_uuid)"],
    expected: "HTTP 422 'Insufficient parameters'.", oracle: "422 + code 2.", rule: `${R.ctrl}:235`,
  },
  {
    id: "VBU-038", section: 2, feature: "vendorbulk.access", kind: "errorSheet", tier: "safe", errorSheetCheck: "unknownJob",
    title: "Error sheet for a job with no failed rows says so",
    type: "Negative", priority: "P2", severity: "Medium",
    why: "The 'no failed rows' branch renders error 487, whose text is about phone numbers — a buyer clicking 'Download Excel' sees a message that makes no sense.",
    steps: ["GET /v1/bulk_create_vendor_error_sheet?job_uuid=<an id with no failed rows>"],
    expected: "HTTP 422 with a message like 'This job has no failed rows'. Today: 'You are not allowed to change the phone number.'",
    oracle: "Status 4xx and the message is about the job, not phones.", rule: `${R.ctrl}:238; ${R.loc} api_errors.487`,
  },
  {
    id: "VBU-039", section: 2, feature: "vendorbulk.access", kind: "errorSheet", tier: "safe", errorSheetCheck: "realJob",
    title: "Error sheet of a failed job lists the failed rows with their error",
    type: "Functional", priority: "P1", severity: "Medium",
    why: "The error sheet is how a buyer fixes a big upload; it must hold every failed row and an Error column.",
    steps: ["Upload one tripwired row", "GET the error sheet for that job", "Read it"],
    sheet: one(trip("VBU-039", {})), rows: tripped(),
    expected: "HTTP 200 excel_url; the file's first column is 'Error' = 'Invalid Status', followed by the row's values.",
    oracle: "Parsed error sheet.", rule: `${R.ctrl}:232-245; ${R.tpl}:336-359`,
  },
  {
    id: "VBU-040", section: 2, feature: "vendorbulk.access", kind: "bulk", tier: "safe", requires: { disableManual: true },
    title: "disable_manual_vendor_creation blocks the upload for client users", type: "Negative", priority: "P1", severity: "High",
    why: "The setting exists to force vendors in through integration only. It runs before the file is even read.",
    steps: ["On a workspace with the setting on, as a client (non-Procol) user: POST a tripwired sheet"],
    sheet: one(trip("VBU-040", {})), refuse: { message: MSG.MANUAL_OFF }, qaDoc: [],
    expected: "HTTP 422 error 745 'Manual vendor creation is disabled'; nothing staged. (A Procol employee is allowed.)",
    oracle: "422 + 745; no job rows.", rule: `${R.ctrl}:205-208`,
    disagree: "The Vendors page in onboarding mode still shows the Bulk Upload link with no check (vendorOnboardingFlow.jsx:249-258); the legacy lists hide it — see VBU-047.",
  },
  {
    id: "VBU-043", section: 2, feature: "vendorbulk.access", kind: "http", tier: "safe", requires: { disableManual: true },
    title: "disable_manual_vendor_creation also blocks the template download", type: "Negative", priority: "P2", severity: "Medium",
    why: "Same gate on the template endpoint, so the buyer is told before filling a sheet.",
    steps: ["GET /v1/bulk_create_vendor_template on a workspace with the setting on"],
    method: "GET", path: "/v1/bulk_create_vendor_template", httpExpected: "reject", httpMessage: MSG.MANUAL_OFF,
    expected: "HTTP 422 error 745 'Manual vendor creation is disabled'.", oracle: "422 + 745.", rule: `${R.ctrl}:219-222`,
  },
  {
    id: "VBU-041", section: 2, feature: "vendorbulk.access", kind: "bulk", tier: "safe", actor: "seller-qa",
    title: "A vendor (seller) user cannot bulk upload vendors", type: "Security", priority: "P0", severity: "High",
    why: "The upload creates companies, users and invitations; CompanyPolicy#bulk_create_vendor? refuses sellers first. Run as one of our own QA test vendors (qa_…@example.com), never a real supplier.",
    steps: ["Sign in as a QA test vendor of this workspace (vendor app, OTP rule of the sandbox)", "POST a tripwired sheet"],
    sheet: one(trip("VBU-041", {})), refuse: {},
    expected: "Refused and nothing staged — HTTP 401 'This app is not authorized to use this API' (the vendor app may not call it at all) or 403/422 from the policy.", oracle: "Refusal + no job rows for that user.", rule: `${R.pol}:123-126; config/app_auth_config.yml (bulk_create_vendor only in the console apps)`,
  },
  {
    id: "VBU-044", section: 2, feature: "vendorbulk.access", kind: "bulk", tier: "safe", actor: "member-no-company-create",
    title: "A buyer without company:create_record cannot bulk upload vendors", type: "Security", priority: "P0", severity: "High",
    why: "The policy's second condition. The runner only uses a member session after the dashboard configuration confirms it lacks company:create_record.",
    steps: ["Use a workspace user whose permissions lack company:create_record", "POST a tripwired sheet"],
    sheet: one(trip("VBU-044", {})), refuse: {},
    expected: "HTTP 422 'You are not authorized to perform this action' (or 401/403); nothing staged.", oracle: "Refusal + no job rows for that user.", rule: `${R.pol}:123-126`,
  },
  {
    id: "VBU-042", section: 2, feature: "vendorbulk.access", kind: "http", tier: "safe", actor: "member-no-company-create",
    title: "The template endpoint refuses a user who may not upload", type: "Security", priority: "P2", severity: "Low",
    why: "bulk_create_vendor_template never calls authorize, so anyone signed in to the console app gets the workspace's category codes and profile types.",
    steps: ["As a user without company:create_record: GET /v1/bulk_create_vendor_template"],
    method: "GET", path: "/v1/bulk_create_vendor_template?as=member-without-company-create", httpExpected: "reject",
    expected: "Refused like the upload itself (401/403/422 not authorised). Today: served.", oracle: "Status.", rule: `${R.ctrl}:218-229 (no authorize)`,
  },
  {
    id: "VBU-045", section: 2, feature: "vendorbulk.access", kind: "errorSheetReupload", tier: "safe",
    title: "Uploading the error sheet back re-checks the rows (its Error column is ignored)", type: "Functional", priority: "P1", severity: "Medium",
    why: "The normal way to fix a big upload is: download the error sheet, correct it, upload it again. The error sheet has an extra 'Error' column first; it must not break the re-upload.",
    steps: ["Upload a tripwired sheet", "Download that job's error sheet", "Upload the error sheet as it is", "Compare the rows"],
    sheet: one(trip("VBU-045", {})), rows: tripped(),
    expected: "The re-uploaded job has the same rows with the same error ('Invalid Status').", oracle: "Rows of both jobs.", rule: `${R.tpl}:336-359; ${R.parse}:168-181`,
  },
  {
    id: "VBU-046", section: 2, feature: "vendorbulk.access", kind: "manual", tier: "safe", verdict: "manual",
    manualReason: "A screen check in the web app (UI automation).",
    title: "The upload screen's file picker offers only files the API can read", type: "Functional", priority: "P2", severity: "Low",
    why: "The picker accepts .csv, which the API always refuses with 'Invalid file format' (VBU-007).",
    steps: ["Vendors → Bulk Upload → New Upload", "Open the file picker and check the allowed types"],
    expected: "Only .xlsx / .xls. Today .csv is offered too.", oracle: "The input's accept attribute.",
    rule: "procol-client-dashboard/src/views/vendorBulkUpload/uploadExcelModal.jsx:124-128",
  },
  {
    id: "VBU-047", section: 2, feature: "vendorbulk.access", kind: "manual", tier: "safe", verdict: "manual", requires: { disableManual: true },
    manualReason: "A screen check; needs a workspace with disable_manual_vendor_creation on.",
    title: "In onboarding mode the Bulk Upload link is hidden when manual creation is disabled", type: "Functional", priority: "P2", severity: "Low",
    why: "The legacy vendor lists hide the link; the onboarding-mode page shows it with no check, and the API then answers 745.",
    steps: ["On an onboarding (v2/v3) workspace with disable_manual_vendor_creation on, as a client user, open Vendors"],
    expected: "No Bulk Upload link (as on the legacy lists).", oracle: "Link visibility.",
    rule: "procol-client-dashboard/src/views/vendors/vendorOnboardingFlow/vendorOnboardingFlow.jsx:249-258",
  },
  {
    id: "VBU-048", section: 2, feature: "vendorbulk.access", kind: "manual", tier: "safe", verdict: "manual",
    manualReason: "A screen check in the web app.",
    title: "The job list tags a job with failed or duplicate rows", type: "Functional", priority: "P3", severity: "Low",
    why: "The page defines Error and Duplicate tags but the data mapping only ever assigns Completed / In Progress.",
    steps: ["Upload a sheet with a failed row", "Open Vendors → Bulk Upload"],
    expected: "The job shows an Error tag (or its failed count stands out). Today: 'Completed'.", oracle: "Tag on the job row.",
    rule: "procol-client-dashboard/src/redux/vendors/index.js:4-9, 53-64",
  },

  // ════════════ 3. row rules ════════════
  // mandatory
  {
    id: "VBU-050", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "safe",
    title: "Company Name blank is refused", type: "Negative", priority: "P0", severity: "High",
    why: "The one field that is mandatory in every configuration.",
    steps: ["Tripwired row with Company Name blank", "POST", "Read the row"],
    sheet: one(trip("VBU-050", { "Company Name": "" })), rows: fails(MSG.MAND),
    expected: "Row failed 'Mandatory Item cannot be left empty'.", oracle: "Job row error.", rule: `${R.val}:215-220`,
  },
  {
    id: "VBU-051", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "safe",
    title: "Company Name of only spaces is refused", type: "Boundary", priority: "P1", severity: "Medium",
    why: "'   ' is present to Excel but blank to Rails; it must not create a nameless vendor.",
    steps: ["Company Name = three spaces"], sheet: one(trip("VBU-051", { "Company Name": "   " })), rows: fails(MSG.MAND),
    expected: "Row failed 'Mandatory Item cannot be left empty'.", oracle: "Job row error.", rule: `${R.val}:217 (.blank?)`,
  },
  {
    id: "VBU-052", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "safe", requires: { contactless: true },
    title: "With contactless on, POC Full Name may be blank", type: "Functional", priority: "P0", severity: "High",
    why: "Suite A of the PR: the contact fields become optional.",
    steps: ["Tripwired row with POC - Full Name blank"], sheet: one(trip("VBU-052", { "POC - Full Name": "" })), rows: tripped(),
    expected: "Row passes every rule before Status → failed 'Invalid Status'.", oracle: "Job row error.", rule: `${R.prUtils}:802,820`,
  },
  {
    id: "VBU-053", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "safe", requires: { contactless: true },
    title: "With contactless on, POC Email may be blank", type: "Functional", priority: "P0", severity: "High",
    why: "On the old code a blank email fails verify_email ('Invalid Email') even when it is not mandatory; the PR must skip the format check for a blank value.",
    steps: ["Tripwired row with POC - Email Address blank"], sheet: one(trip("VBU-053", { "POC - Email Address": "" })), rows: tripped(),
    expected: "Row failed 'Invalid Status' (email not required, not format-checked when blank).", oracle: "Job row error.", rule: `${R.prVal}:39`,
  },
  {
    id: "VBU-054", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "safe", requires: { contactless: true },
    title: "With contactless on, Vendor Profile may be blank", type: "Functional", priority: "P1", severity: "Medium",
    why: "The live template lists Vendor Profile under Optional; a blank value must default to manufacturer, not fail.",
    steps: ["Tripwired row with Vendor Profile blank"], sheet: one(trip("VBU-054", { "Vendor Profile": "" })), rows: tripped(),
    expected: "Row failed 'Invalid Status'.", oracle: "Job row error.", rule: `${R.prVal}:186-192`,
  },
  {
    id: "VBU-055", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "safe", requires: { contactless: true },
    title: "With contactless on, a supplied POC email is still format-checked", type: "Negative", priority: "P0", severity: "High",
    why: "Optional must not mean unvalidated (QA doc A3).",
    steps: ["Tripwired row with POC - Email Address 'not-an-email'"], sheet: one(trip("VBU-055", { "POC - Email Address": "not-an-email" })), rows: fails(MSG.EMAIL),
    expected: "Row failed 'Invalid Email'.", oracle: "Job row error.", rule: `${R.val}:37,58-60`,
  },
  {
    id: "VBU-056", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "safe", requires: { contactless: true },
    title: "With contactless on, a row with no tax number and no city/address passes validation", type: "Functional", priority: "P0", severity: "High",
    why: "QA doc A1: Company Name alone is a valid row. On the old code this was 'Either Tax No. or Without Tax No. fields are needed'.",
    steps: ["Tripwired row with Tax No., City and Address blank"], sheet: one(trip("VBU-056", { City: "", Address: "" })), rows: tripped(),
    expected: "Row failed 'Invalid Status'.", oracle: "Job row error.", rule: `${R.prUtils}:828,842 (no Without-Tax group under contactless); ${R.val}:24-30`,
  },
  // tax
  {
    id: "VBU-059", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "safe",
    title: "Business Location 'India' + Tax Type GST resolves to the active GST mapping", type: "Functional", priority: "P0", severity: "Critical",
    why: "verify_tax_no does Country.find_by(name: 'India') with no order or status filter, then looks for an ACTIVE mapping for that one country row. The sandbox has 36 countries named 'India' (35 added 15-16 Jan 2026, all with inactive GST mappings), so which one Postgres returns first decides whether ANY GST row can be uploaded. 55 real rows failed this way in the last 60 days.",
    steps: ["Tripwired row with Tax Type GST, a well-formed GSTIN {{gst}}, Business Location India"],
    sheet: one(trip("VBU-059", { "Tax Type": "GST", "Tax No.": "{{gst}}", "Business Location": "India" })), rows: tripped(),
    expected: "Row passes the tax check → failed 'Invalid Status'. Failing with 'Tax Type not configured for the selected Business Location' means the duplicate-country trap fired.",
    oracle: "Job row error; SELECT id FROM countries WHERE name='India' shows the duplicates.",
    rule: `${R.val}:86-91 (find_by without order/active); countries table on the sandbox`,
  },
  {
    id: "VBU-060", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "safe",
    title: "A valid GSTIN with Tax Type GST and Business Location India passes", type: "Functional", priority: "P0", severity: "High",
    why: "The tax path looks up Country and TaxType by exact name and matches the mapping's regex.",
    steps: ["Tripwired row with Tax Type GST, Tax No. {{gst}}, Business Location India"],
    sheet: one(trip("VBU-060", { "Tax Type": "GST", "Tax No.": "{{gst}}", "Business Location": "India" })), rows: tripped(),
    expected: "Row failed 'Invalid Status'.", oracle: "Job row error.", rule: `${R.val}:82-100`,
  },
  {
    id: "VBU-061", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "safe",
    title: "A lower-case GSTIN is refused", type: "Validation", priority: "P2", severity: "Low",
    why: "The India GST regex is upper-case only and the value is not upcased first.",
    steps: ["Tax No. = {{gst}} in lower case"], sheet: one(trip("VBU-061", { "Tax Type": "GST", "Tax No.": "{{gstLower}}", "Business Location": "India" })), rows: fails(MSG.TAXINV),
    expected: "Row failed 'Invalid Tax No.'.", oracle: "Job row error.", rule: `${R.val}:92`,
  },
  {
    id: "VBU-062", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "safe",
    title: "A GSTIN with a trailing space is accepted after trimming", type: "Edge", priority: "P1", severity: "Medium",
    why: "Values pasted into Excel often carry a trailing space; the regex is anchored and the value is never stripped, so a correct GSTIN fails.",
    steps: ["Tax No. = '{{gst}} '"], sheet: one(trip("VBU-062", { "Tax Type": "GST", "Tax No.": "{{gst}} ", "Business Location": "India" })), rows: tripped(),
    expected: "Row failed 'Invalid Status' (the space ignored). Today likely 'Invalid Tax No.'.", oracle: "Job row error.", rule: `${R.val}:92 (no strip)`,
  },
  {
    id: "VBU-063", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "safe",
    title: "A 14-character GSTIN is refused", type: "Boundary", priority: "P1", severity: "Medium",
    why: "Length boundary below the 15-character GSTIN.", steps: ["Tax No. = first 14 chars of {{gst}}"],
    sheet: one(trip("VBU-063", { "Tax Type": "GST", "Tax No.": "{{gst14}}", "Business Location": "India" })), rows: fails(MSG.TAXINV),
    expected: "Row failed 'Invalid Tax No.'.", oracle: "Job row error.", rule: `${R.val}:92`,
  },
  {
    id: "VBU-064", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "safe",
    title: "A 16-character GSTIN is refused", type: "Boundary", priority: "P1", severity: "Medium",
    why: "Length boundary above.", steps: ["Tax No. = {{gst}} + 'X'"],
    sheet: one(trip("VBU-064", { "Tax Type": "GST", "Tax No.": "{{gst}}X", "Business Location": "India" })), rows: fails(MSG.TAXINV),
    expected: "Row failed 'Invalid Tax No.'.", oracle: "Job row error.", rule: `${R.val}:92`,
  },
  {
    id: "VBU-065", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "safe",
    title: "Tax No. without Tax Type is refused", type: "Negative", priority: "P1", severity: "Medium",
    why: "Business Location and Tax Type are both needed to pick the regex.", steps: ["Tax No. set, Tax Type blank"],
    sheet: one(trip("VBU-065", { "Tax No.": "{{gst}}", "Business Location": "India" })), rows: fails(MSG.TAXINV),
    expected: "Row failed 'Invalid Tax No.'.", oracle: "Job row error.", rule: `${R.val}:83-85`,
  },
  {
    id: "VBU-066", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "safe",
    title: "Tax No. without Business Location is refused", type: "Negative", priority: "P1", severity: "Medium",
    why: "Same guard, other field.", steps: ["Tax No. set, Business Location blank"],
    sheet: one(trip("VBU-066", { "Tax Type": "GST", "Tax No.": "{{gst}}" })), rows: fails(MSG.TAXINV),
    expected: "Row failed 'Invalid Tax No.'.", oracle: "Job row error.", rule: `${R.val}:83-85`,
  },
  {
    id: "VBU-067", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "safe",
    title: "VAT for India (a pair with no mapping) is refused with the 'not configured' message", type: "Negative", priority: "P1", severity: "Medium",
    why: "The Tax Type dropdown offers GST and VAT for every country; VAT+India has no TaxTypeCountryMapping.",
    steps: ["Tax Type VAT, Business Location India"], sheet: one(trip("VBU-067", { "Tax Type": "VAT", "Tax No.": "{{gst}}", "Business Location": "India" })), rows: fails(MSG.TAXCFG),
    expected: "Row failed 'Tax Type not configured for the selected Business Location'.", oracle: "Job row error.", rule: `${R.val}:86-91; ${R.tpl}:284-286 (GST, VAT hard-coded)`,
  },
  {
    id: "VBU-068", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "safe",
    title: "Business Location typed in lower case ('india') is refused", type: "Edge", priority: "P2", severity: "Low",
    why: "Country.find_by(name:) is an exact, case-sensitive match; a typed value (not from the dropdown) fails with a misleading message.",
    steps: ["Business Location = 'india'"], sheet: one(trip("VBU-068", { "Tax Type": "GST", "Tax No.": "{{gst}}", "Business Location": "india" })), rows: fails(MSG.TAXCFG),
    expected: "Row failed 'Tax Type not configured for the selected Business Location' (documents the case sensitivity).", oracle: "Job row error.", rule: `${R.val}:86`,
  },
  {
    id: "VBU-069", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "safe",
    title: "Tax Type typed in lower case ('gst') is refused", type: "Edge", priority: "P2", severity: "Low",
    why: "TaxType.find_by(name:) is exact too.", steps: ["Tax Type = 'gst'"],
    sheet: one(trip("VBU-069", { "Tax Type": "gst", "Tax No.": "{{gst}}", "Business Location": "India" })), rows: fails(MSG.TAXCFG),
    expected: "Row failed 'Tax Type not configured for the selected Business Location'.", oracle: "Job row error.", rule: `${R.val}:87`,
  },
  {
    id: "VBU-070", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "safe",
    title: "The tax error wins over a missing Company Name", type: "Edge", priority: "P3", severity: "Low",
    why: "Pins the error order: the tax check runs first, so a row broken twice reports tax.",
    steps: ["Invalid Tax No. AND Company Name blank"], sheet: one(trip("VBU-070", { "Company Name": "", "Tax Type": "GST", "Tax No.": "BAD", "Business Location": "India" })), rows: fails(MSG.TAXINV),
    expected: "Row failed 'Invalid Tax No.'.", oracle: "Job row error.", rule: `${R.val}:46-54`,
  },
  {
    id: "VBU-071", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "safe",
    title: "A valid UK VAT number with Business Location United Kingdom passes", type: "Functional", priority: "P2", severity: "Low",
    why: "International vendors: VAT + a non-India country uses a different regex.",
    steps: ["Tax Type VAT, Tax No. GB123456789, Business Location United Kingdom"], sheet: one(trip("VBU-071", { "Tax Type": "VAT", "Tax No.": "GB123456789", "Business Location": "United Kingdom" })), rows: tripped(),
    expected: "Row failed 'Invalid Status'.", oracle: "Job row error.", rule: `${R.val}:82-100`,
  },
  {
    id: "VBU-072", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "safe",
    title: "A Tax No. typed as a number cell is refused cleanly", type: "Edge", priority: "P2", severity: "Medium",
    why: "A numeric cell reaches the parser as a Float; it is stringified before .match?, so it must fail the regex, not raise.",
    steps: ["Tax No. = 123456789012345 as a NUMBER cell"], sheet: one(trip("VBU-072", { "Tax Type": "GST", "Tax No.": 123456789012345, "Business Location": "India" })), rows: fails(MSG.TAXINV),
    expected: "Row failed 'Invalid Tax No.'; no worker crash.", oracle: "Job row error.", rule: `${R.parse}:176; ${R.val}:92`,
  },
  {
    id: "VBU-073", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "safe",
    title: "PAN No. that is not a PAN is accepted (no format check — known gap)", type: "Validation", priority: "P2", severity: "Low",
    why: "The PR adds the column; its QA doc lists PAN format validation as out of scope. Pinned so a later change is noticed.",
    steps: ["PAN No. = 'NOT-A-PAN'"], sheet: one(trip("VBU-073", { "PAN No.": "NOT-A-PAN" })), rows: tripped(),
    expected: "Row failed 'Invalid Status' (PAN not validated).", oracle: "Job row error.", rule: `${R.prUtils}:905 (strip+upcase only, no format check); QA doc 'Out of scope'`,
  },
  {
    id: "VBU-074", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "safe",
    title: "PAN No. that contradicts the GSTIN is accepted (no cross-check — known gap)", type: "Validation", priority: "P2", severity: "Medium",
    why: "Characters 3-12 of a GSTIN are the PAN. A different PAN in the PAN column is stored side by side with it.",
    steps: ["Valid GST {{gst}}; PAN No. = ABCDE1234F"], sheet: one(trip("VBU-074", { "Tax Type": "GST", "Tax No.": "{{gst}}", "Business Location": "India", "PAN No.": "ABCDE1234F" })), rows: tripped(),
    expected: "Row failed 'Invalid Status' today. Recommended: refuse 'PAN does not match GST'.", oracle: "Job row error.", rule: `${R.prVal}:106-118 (PAN derived from GST under contactless); ${R.prUtils}:905 (the PAN No. column then overwrites it)`,
  },
  // city
  {
    id: "VBU-075", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "creates",
    title: "A city that is not in the master (no tax number) does not become a random city", type: "Validation", priority: "P1", severity: "Medium",
    why: "Old code: 'Invalid City Name'. QA doc A5: 'Success. Record created with no city'. The company builder defaults a missing city to id 38 ('-'). Status=rejected keeps the row mail-free if it is created.",
    steps: ["Status rejected, City 'QA Nowhere {{stamp}}', no Tax No.", "POST", "Read the row and the vendor"],
    sheet: one({ ...baseRow("VBU-075"), Status: "rejected", City: `QA Nowhere ${S}` }),
    rows: [{ status: "success", verify: { bscm: "rejected", fields: { city_id: null } } }],
    expected: "Per the PR's QA doc: success, vendor stored with NO city (city_id null, or the '-' placeholder 38). Never a city id that does not exist.",
    oracle: "Row status + companies.city_id.", rule: `${R.prVal}:77 (city error skipped under contactless); ${R.utils}:877-884 ('City' → key city_id holds the NAME); ${R.prMixin}:27 (params city_id present, so no fallback)`,
    disagree: "Found 2026-09-29: the unresolved city NAME is passed as city_id and cast to 0, so the vendor points at a city that does not exist (see VBU-154 for the crash it causes).",
  },
  {
    id: "VBU-076", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "creates",
    title: "A one-letter city ('a') is not fuzzy-matched to some real city", type: "Validation", priority: "P1", severity: "Medium",
    why: "City lookup falls back to name ILIKE '%a%' and takes the first alphabetically — any typo becomes a real, wrong city.",
    steps: ["Status rejected, City 'a', no Tax No."], sheet: one({ ...baseRow("VBU-076"), Status: "rejected", City: "a" }),
    rows: [{ status: "success", verify: { bscm: "rejected", fields: { city_id: null } } }],
    expected: "Either refused 'Invalid City Name' or stored with no city — never a city the buyer didn't name. Today: the first city containing 'a'.",
    oracle: "companies.city_id → cities.name.", rule: `${R.val}:122-131; ${R.city}:30 (ILIKE %x%)`,
  },
  {
    id: "VBU-154", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "creates", baseline: "cityZero", requires: { contactless: true, canSkip: true },
    title: "A second vendor with the tax number of a 'no city' vendor does not crash the upload", type: "Edge", priority: "P0", severity: "High",
    why: "A contactless row with an unknown city is stored with city_id 0 (VBU-075). When a later row carries the same tax number but no City/Address, the invite looks the tax number up and reads existing_company.city.name — on a city that does not exist.",
    setup: "Baseline (uploaded first): UK VAT {{vatF}}, City 'QA Nowhere {{stamp}}', address set, onboarding No — stored with city_id 0.",
    steps: ["Upload the baseline", "Upload a second row: same tax number {{vatF}}, a different name, City and Address blank, onboarding No", "Read the second row"],
    sheet: one({ "Company Name": vName("VBU-154"), "POC - Full Name": "QA Platform Tester", "POC - Email Address": vEmail("VBU-154"), "Tax Type": "VAT", "Tax No.": "{{vatF}}", "Business Location": "United Kingdom", "Vendor Onboarding Required": "No" }),
    rows: [{ status: "failed", errorIncludes: MSG.DUP_ADDR }],
    expected: "The row is handled cleanly — refused 'Vendor with this GST and address already exists' (the back-filled address matches) — not a worker error.",
    oracle: "Job row error; a worker 'Internal error …' is the async 500.",
    rule: `${R.helper}:731-745 (existing_company.city.name); ${R.send}:41-54`,
  },
  // email
  ...([
    ["VBU-080", "An email with no @ is refused", "not-an-email", MSG.EMAIL, "P0", "The basic case."],
    ["VBU-081", "An email with no top-level domain is refused", `qa_${S}@example`, MSG.EMAIL, "P1", "VALID_EMAIL_REGEX needs a dot-TLD."],
    ["VBU-082", "An email with a space inside is refused", `qa ${S}@example.com`, MSG.EMAIL, "P1", "Excel users paste 'first last@…'."],
    ["VBU-083", "An email with consecutive dots is refused", `qa..${S}@example.com`, MSG.EMAIL, "P2", "The regex allows [\\w+\\-.&]+ in the local part, so 'a..b' passes although no mail server accepts it."],
    ["VBU-084", "An email whose local part is over 64 characters is refused", `qa_${long(70, "x")}@example.com`, MSG.EMAIL, "P2", "RFC 5321 caps the local part at 64; the regex has no length limit."],
    ["VBU-085", "Two emails in one cell are refused", `qa_${S}_a@example.com, qa_${S}_b@example.com`, MSG.EMAIL, "P1", "A common Excel habit; must not be sent a single invite to a comma list."],
    ["VBU-086", "A non-ASCII domain is refused", `qa_${S}@exämple.com`, MSG.EMAIL, "P3", "The regex is ASCII-only."],
  ] as const).map(([id, title, value, msg, pri, why]): VbuCase => ({
    id, section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "safe", title, type: "Validation", priority: pri, severity: pri === "P0" ? "High" : pri === "P3" ? "Low" : "Medium",
    why, steps: [`POC - Email Address = ${value}`], sheet: one(trip(id, { "POC - Email Address": value })), rows: fails(msg),
    expected: `Row failed '${msg}'.`, oracle: "Job row error.", rule: `${R.utils}:13 (VALID_EMAIL_REGEX), 506-509; ${R.val}:147-151`,
  })),
  ...([
    ["VBU-087", "An upper-case email is accepted", `QA_VBU_${S}_087@EXAMPLE.COM`, "The regex is case-insensitive; the invite matches users with lower(email)."],
    ["VBU-088", "An email with spaces around it is accepted after trimming", `  qa_vbu_${S}_088@example.com  `, "The upload helper strips POC emails before staging."],
    ["VBU-089", "An email with a +tag is accepted", `qa_vbu_${S}_089+tag@example.com`, "Plus-addressing is legal and common."],
  ] as const).map(([id, title, value, why]): VbuCase => ({
    id, section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "safe", title, type: "Functional", priority: "P2", severity: "Low",
    why, steps: [`POC - Email Address = '${value}'`], sheet: one(trip(id, { "POC - Email Address": value })), rows: tripped(),
    expected: "Row failed 'Invalid Status' (email accepted).", oracle: "Job row error.", rule: `${R.utils}:13; ${R.helper}:687-690`,
  })),
  {
    id: "VBU-090", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "safe",
    title: "An invalid POC 2 email is refused", type: "Validation", priority: "P1", severity: "Medium",
    why: "The second contact gets its own invite; its email is checked separately.",
    steps: ["POC 2 - Full Name set, POC 2 - Email Address 'bad@'"], sheet: one(trip("VBU-090", { "POC 2 - Full Name": "QA Second Contact", "POC 2 - Email Address": "bad@" })), rows: fails(MSG.EMAIL2),
    expected: "Row failed 'Invalid Email 2'.", oracle: "Job row error (exact).", rule: `${R.val}:38-40,61-63`,
  },
  // deals in
  {
    id: "VBU-091", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "safe",
    title: "Deals In with an unknown category is refused and names it", type: "Validation", priority: "P1", severity: "Medium",
    why: "Deals In ties the vendor to category teams; an unknown code must be named in the error.",
    steps: ["Deals In = QA_NOT_A_CATEGORY"], sheet: one(trip("VBU-091", { "Deals In": "QA_NOT_A_CATEGORY" })), rows: fails(`${MSG.DEALS}QA_NOT_A_CATEGORY`),
    expected: "Row failed 'Invalid Deals In : QA_NOT_A_CATEGORY'.", oracle: "Job row error.", rule: `${R.val}:161-179`,
  },
  {
    id: "VBU-092", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "safe",
    title: "Deals In with a valid category code passes", type: "Functional", priority: "P1", severity: "Medium",
    why: "The template's Data Sheet lists the codes; one must be accepted.", steps: ["Deals In = {{categoryUuid}}"],
    sheet: one(trip("VBU-092", { "Deals In": "{{categoryUuid}}" })), rows: tripped(),
    expected: "Row failed 'Invalid Status'.", oracle: "Job row error.", rule: `${R.val}:165-169`,
  },
  {
    id: "VBU-093", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "safe",
    title: "Deals In 'valid,unknown' refuses the unknown one", type: "Validation", priority: "P1", severity: "Medium",
    why: "verify_deals_in RETURNS 'valid' on the first good code, so every code after it is never checked — the garbage one is silently dropped (or decoded to nil).",
    steps: ["Deals In = {{categoryUuid}},QA_NOT_A_CATEGORY"], sheet: one(trip("VBU-093", { "Deals In": "{{categoryUuid}},QA_NOT_A_CATEGORY" })), rows: fails(`${MSG.DEALS}QA_NOT_A_CATEGORY`),
    expected: "Row failed 'Invalid Deals In : QA_NOT_A_CATEGORY'. Today likely 'Invalid Status' (the bad code slipped through).",
    oracle: "Job row error.", rule: `${R.val}:165-170 (return on first valid id)`,
  },
  {
    id: "VBU-094", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "safe",
    title: "Deals In 'unknown,valid' refuses the unknown one", type: "Validation", priority: "P2", severity: "Low",
    why: "The mirror of VBU-093 — shows the result depends only on order.", steps: ["Deals In = QA_NOT_A_CATEGORY,{{categoryUuid}}"],
    sheet: one(trip("VBU-094", { "Deals In": "QA_NOT_A_CATEGORY,{{categoryUuid}}" })), rows: fails(`${MSG.DEALS}QA_NOT_A_CATEGORY`),
    expected: "Row failed 'Invalid Deals In : QA_NOT_A_CATEGORY'.", oracle: "Job row error.", rule: `${R.val}:171-175`,
  },
  // profile
  {
    id: "VBU-095", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "safe", requires: { extraField: "__custom_profiles__" },
    title: "'manufacturer' is refused where the workspace defines its own profiles", type: "Validation", priority: "P1", severity: "Medium",
    why: "With vendor_category_type_mapping set, only its keys are valid — the QA doc's 'manufacturer or brokerage' is wrong for GMMCO.",
    steps: ["Vendor Profile = manufacturer"], sheet: one(trip("VBU-095", { "Vendor Profile": "manufacturer" })), rows: fails(MSG.PROFILE),
    expected: "Row failed 'Invalid Vendor Profile'.", oracle: "Job row error.", rule: `${R.utils}:847-857; ${R.val}:189-192`,
    disagree: "QA doc lists manufacturer/brokerage as the valid profiles.",
  },
  {
    id: "VBU-096", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "safe",
    title: "The profile's display label is refused (the key is required)", type: "Validation", priority: "P2", severity: "Low",
    why: "Buyers see 'Manufacturer/Trader' in the product; the sheet needs 'manufacturer_trader'.",
    steps: ["Vendor Profile = Manufacturer/Trader"], sheet: one(trip("VBU-096", { "Vendor Profile": "Manufacturer/Trader" })), rows: fails(MSG.PROFILE),
    expected: "Row failed 'Invalid Vendor Profile'.", oracle: "Job row error.", rule: `${R.val}:189`,
  },
  {
    id: "VBU-097", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "safe",
    title: "The profile key in upper case is accepted", type: "Functional", priority: "P3", severity: "Low",
    why: "The match is case-insensitive.", steps: ["Vendor Profile = {{profile}} upper-cased"],
    sheet: one(trip("VBU-097", { "Vendor Profile": "{{profileUpper}}" })), rows: tripped(),
    expected: "Row failed 'Invalid Status'.", oracle: "Job row error.", rule: `${R.val}:189`,
  },
  {
    id: "VBU-098", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "safe",
    title: "A profile with a trailing space is accepted after trimming", type: "Edge", priority: "P2", severity: "Low",
    why: "Status and onboarding values are stripped before comparing; the profile is not — inconsistent, and a common copy-paste result.",
    steps: ["Vendor Profile = '{{profile}} '"], sheet: one(trip("VBU-098", { "Vendor Profile": "{{profile}} " })), rows: tripped(),
    expected: "Row failed 'Invalid Status'. Today likely 'Invalid Vendor Profile'.", oracle: "Job row error.", rule: `${R.val}:189 (no strip) vs 199 (strip)`,
  },
  // status
  {
    id: "VBU-100", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "safe",
    title: "An unknown Status is refused", type: "Validation", priority: "P1", severity: "Medium",
    why: "Only blank, active and rejected are allowed.", steps: ["Status = banana (onboarding tripwire behind it)"],
    sheet: one(tripOnb("VBU-100", { Status: "banana" })), rows: fails(MSG.STATUS),
    expected: "Row failed 'Invalid Status'.", oracle: "Job row error.", rule: `${R.val}:196-202`,
  },
  {
    id: "VBU-101", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "safe",
    title: "Status 'blacklisted' is refused", type: "Validation", priority: "P2", severity: "Low",
    why: "A real BSCM status, but not one the sheet may set.", steps: ["Status = blacklisted"],
    sheet: one(tripOnb("VBU-101", { Status: "blacklisted" })), rows: fails(MSG.STATUS),
    expected: "Row failed 'Invalid Status'.", oracle: "Job row error.", rule: `${R.utils}:836 (vendor_status_types)`,
  },
  {
    id: "VBU-102", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "safe", requires: { canSkip: true },
    title: "Status '  REJECTED  ' is accepted (trimmed, any case)", type: "Functional", priority: "P2", severity: "Low",
    why: "Pins the strip/downcase the validator does.", steps: ["Status = '  REJECTED  '"],
    sheet: one(tripOnb("VBU-102", { Status: "  REJECTED  " })), rows: fails(MSG.ONB),
    expected: "Row passes Status and stops at the onboarding tripwire: 'Invalid Vendor Onboarding Required. Choose Yes or No from the dropdown'.", oracle: "Job row error.", rule: `${R.val}:199-200`,
  },
  // onboarding required
  ...([
    ["VBU-105", "Maybe"], ["VBU-106", "N"], ["VBU-107", "true"], ["VBU-108", "yess"],
  ] as const).map(([id, value]): VbuCase => ({
    id, section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "safe", requires: { canSkip: true },
    title: `'Vendor Onboarding Required' = '${value}' is refused`, type: "Validation", priority: id === "VBU-105" ? "P0" : "P2", severity: id === "VBU-105" ? "High" : "Low",
    why: "Anything but Yes/No must fail loudly: a silently-ignored value decides whether the vendor is onboarded. Status=rejected keeps the row mail-free even if the rule is broken.",
    steps: [`Status rejected, Vendor Onboarding Required = ${value}`], sheet: one({ ...baseRow(id), Status: "rejected", "Vendor Onboarding Required": value }), rows: fails(MSG.ONB),
    expected: `Row failed '${MSG.ONB}'.`, oracle: "Job row error.", rule: `${R.val}:204-213`,
  })),
  // vendor code
  {
    id: "VBU-110", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "creates",
    title: "A 101-character Vendor Code is refused before anything is created", type: "Boundary", priority: "P1", severity: "Medium",
    why: "The worker checks size > 100 and marks the row failed before the invite runs.",
    steps: ["Valid row (onboarding No), Vendor Code = 101 × 'V'"], sheet: one({ ...baseRow("VBU-110"), "Vendor Code": long(101, "V") }),
    rows: [{ status: "failed", errorIncludes: MSG.VCODE, verify: { absent: true } }],
    expected: "Row failed 'Invalid Value for Vendor Code.'; no vendor created.", oracle: "Job row + no company.", rule: `${R.wrk}:106-113`,
  },
  {
    id: "VBU-111", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "creates",
    title: "A 100-character Vendor Code is accepted", type: "Boundary", priority: "P2", severity: "Low",
    why: "The boundary itself.", steps: ["Valid row (onboarding No), Vendor Code = 100 chars"],
    sheet: one({ ...baseRow("VBU-111"), "Vendor Code": "{{vcode100}}" }),
    rows: [{ status: "success", verify: { bscm: "active" } }],
    expected: "Row success; vendor Active with that code.", oracle: "Job row + BSCM vendor_code.", rule: `${R.wrk}:108`,
  },
  // extra fields
  {
    id: "VBU-112", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "safe", requires: { extraField: "Account Group" },
    title: "An Account Group that is not one of the dropdown's options is refused", type: "Validation", priority: "P1", severity: "Medium",
    why: "GMMCO configures Account Group as a DROPDOWN (ZCOV, ZDGS, …) that feeds SAP. The single-vendor form enforces the list; the bulk path stores any text.",
    steps: ["Account Group = QA_NOT_A_GROUP"], sheet: one(trip("VBU-112", { "Account Group": "QA_NOT_A_GROUP" })), rows: fails("Invalid Account Group"),
    expected: "Row failed with an Account Group error. Today likely 'Invalid Status' (value accepted).", oracle: "Job row error.",
    rule: `${R.mixin}:41-60 (stores any value); custom config extra_fields_for_vendor_invite type=dropdown`,
    disagree: "QA doc models Account Group as free text and uses 'ZDOM', which is not one of GMMCO's options.",
  },

  // ════════════ 4. what a row creates ════════════
  {
    id: "VBU-119", section: 4, feature: "vendorbulk.onboarding", kind: "bulk", tier: "real-mail", requires: { canSkip: true, extraField: "Account Group" },
    title: "A full row (UK VAT) with 'Onboarding Required = No' becomes an Active vendor with every field stored", type: "Functional", priority: "P0", severity: "Critical",
    why: "The same non-PQ path as VBU-120 with a tax number the sandbox can resolve — so the creation, routing and storage can be verified even while GST rows are blocked (VBU-059).",
    steps: ["Row with UK VAT, city, address, pincode, PAN, profile 2, POC, POC 2, Account Group, MSME, bank, onboarding No", "POST", "Read the vendor, mapping and invitations"],
    sheet: one({
      ...baseRow("VBU-119"), "Vendor Profile": "{{profile2}}", "Tax Type": "VAT", "Tax No.": "{{vatA}}", "Business Location": "United Kingdom",
      Address: "QA Full Row Road 8", Pincode: "400 002", "PAN No.": "{{pan}}", "POC 2 - Full Name": "QA Second Contact", "POC 2 - Email Address": vEmail("VBU-119", 2),
      "Account Group": "ZDGS", "MSME Registration Number": "UDYAM-MH-00-0000002", "Bank Account Number": "000000000002", "Bank IFSC Code": "QATZ0000002",
    }),
    rows: [{ status: "success", verify: { bscm: "active", invitations: 2, invitationStatus: "active", skipOnboarding: true, fields: { gst_no: "{{vatA}}", pan_no: "{{pan}}", address: "QA Full Row Road 8", city: "Mumbai", "misc.account_group": "ZDGS", "misc.msme_registration_number": "UDYAM-MH-00-0000002", "misc.bank_account_number": "000000000002", "misc.bank_ifsc_code": "QATZ0000002", "misc.pincode": "400002", "misc.category_data.key": "{{profile2}}" } } }],
    expected: "Row success. Vendor Active (Vendors tab); 2 invitations (POC + POC 2), BOTH with skip_vendor_onboarding=true; tax number, PAN, address, city, pincode (digits only) and the extra fields stored; no 'new prospect' mail. Found 2026-10-05: the POC 2 invitation carries no skip flag, so the vendor-management team is mailed (BUG-29) — hence the real-mail tier.",
    oracle: "companies / buyer_seller_company_mappings / invitations rows.", rule: `${R.wrk}:92-99,141-158; ${R.send}:386-393,407-434; ${R.prMixin}:42-47; ${R.prUtils}:904-905`,
  },
  {
    id: "VBU-120", section: 4, feature: "vendorbulk.onboarding", kind: "bulk", tier: "creates", requires: { canSkip: true, extraField: "Account Group" },
    title: "A full row with 'Onboarding Required = No' becomes an Active vendor with every field stored", type: "Functional", priority: "P0", severity: "Critical",
    why: "The non-PQ path: skip onboarding, land straight on the Vendors tab, carry every column into the vendor record.",
    steps: ["Row with GST, PAN, city, address, pincode, profile 2, POC, Account Group, MSME, bank, onboarding No (no POC 2: its invitation would mail the vendor-management team, BUG-29)", "POST", "Read the vendor, mapping and invitations"],
    sheet: one({
      ...baseRow("VBU-120"), "Vendor Profile": "{{profile2}}", "Tax Type": "GST", "Tax No.": "{{gst}}", "Business Location": "India",
      Address: "QA Full Row Road 7", Pincode: "400001", "PAN No.": "{{pan}}",
      "Account Group": "ZCOV", "MSME Registration Number": "UDYAM-MH-00-0000001", "Bank Account Number": "000000000001", "Bank IFSC Code": "QATZ0000001",
    }),
    rows: [{ status: "success", verify: { bscm: "active", invitations: 1, invitationStatus: "active", skipOnboarding: true, fields: { gst_no: "{{gst}}", pan_no: "{{pan}}", address: "QA Full Row Road 7", city: "Mumbai", "misc.account_group": "ZCOV", "misc.msme_registration_number": "UDYAM-MH-00-0000001", "misc.bank_ifsc_code": "QATZ0000001", "misc.pincode": "400001", "misc.category_data.key": "{{profile2}}" } } }],
    expected: "Row success. Vendor Active (Vendors tab); 1 invitation (the POC) with skip_vendor_onboarding=true; GST, PAN, address, city and the extra fields stored; no 'new prospect' mail (skip flag). POC 2 is left out on purpose — see VBU-119 / BUG-29.",
    oracle: "companies / buyer_seller_company_mappings / invitations rows.", rule: `${R.wrk}:92-99,141-158; ${R.send}:386-393,407-434; ${R.inv}:125-140; ${R.prMixin}:42-47 (pincode → misc.pincode)`,
  },
  {
    id: "VBU-121", section: 4, feature: "vendorbulk.onboarding", kind: "bulk", tier: "creates", requires: { contactless: true, canSkip: true },
    title: "Company Name only + 'No' creates an Active vendor with NO invitation", type: "Functional", priority: "P0", severity: "Critical",
    why: "QA doc: 'a contactless load sends ZERO invite emails' and leaves no invitations row.",
    steps: ["Row: Company Name only, onboarding No", "POST", "Read the vendor and its invitations"],
    sheet: one({ "Company Name": vName("VBU-121"), "Vendor Onboarding Required": "No" }),
    rows: [{ status: "success", verify: { bscm: "active", invitations: 0 } }],
    expected: "Row success; vendor Active; 0 invitations; therefore no mail.", oracle: "BSCM + invitations count.", rule: `${R.prSend}:332-337 (no Invitations row when the email is blank)`,
  },
  {
    id: "VBU-122", section: 4, feature: "vendorbulk.onboarding", kind: "bulk", tier: "creates", requires: { contactless: true, onboardingV2: true },
    title: "Company Name only, onboarding left blank → Prospect, still no mail", type: "Functional", priority: "P0", severity: "Critical",
    why: "Blank means 'onboarding required' → the vendor must sit in Prospects. With no contact there is no invitation, so no mail — including the vendor-management notice.",
    steps: ["Row: Company Name only", "POST", "Read the mapping and invitations"],
    sheet: one({ "Company Name": vName("VBU-122") }),
    rows: [{ status: "success", verify: { bscm: "invited", invitations: 0 } }],
    expected: "Row success; vendor in Prospects (status invited); 0 invitations.", oracle: "BSCM + invitations.", rule: `${R.wrk}:66-71,93; ${R.vpc}:240-249; ${R.prSend}:332-337 (no invitation → no after_commit mail)`,
  },
  {
    id: "VBU-123", section: 4, feature: "vendorbulk.onboarding", kind: "bulk", tier: "real-mail", requires: { canSkip: true },
    title: "A full row with 'Onboarding Required = Yes' becomes a Prospect", type: "Functional", priority: "P0", severity: "Critical",
    why: "The PQ path: the vendor waits in Prospects until onboarding. The invite mails the POC AND tells the vendor-management team a prospect was added.",
    steps: ["Row with contact, onboarding Yes", "POST", "Read the mapping and invitation"],
    sheet: one({ ...baseRow("VBU-123"), "Vendor Onboarding Required": "Yes" }),
    rows: [{ status: "success", verify: { bscm: "invited", invitations: 1, invitationStatus: "active", skipOnboarding: false } }],
    expected: "Row success; vendor in Prospects (invited); invitation active without the skip flag; 'new prospect added' mail queued to the vendor-management team.",
    oracle: "BSCM + invitation.other_details.", rule: `${R.vpc}:240-243; ${R.inv}:125-140`,
  },
  {
    id: "VBU-124", section: 4, feature: "vendorbulk.onboarding", kind: "bulk", tier: "real-mail", requires: { canSkip: true },
    title: "Onboarding Required left blank means Yes (Prospect)", type: "Functional", priority: "P1", severity: "High",
    why: "The default must be the safe one: onboarding required.", steps: ["Row with contact, onboarding blank"],
    sheet: one({ ...baseRow("VBU-124"), "Vendor Onboarding Required": "" }),
    rows: [{ status: "success", verify: { bscm: "invited", skipOnboarding: false } }],
    expected: "Row success; vendor in Prospects.", oracle: "BSCM.", rule: `${R.wrk}:66-71`,
  },
  {
    id: "VBU-125", section: 4, feature: "vendorbulk.onboarding", kind: "bulk", tier: "creates",
    title: "Status 'rejected' lands the vendor on the Rejected tab and creates its user", type: "Functional", priority: "P1", severity: "High",
    why: "Rejected vendors are imported for history; the worker also creates a user for the POC so the record is complete, and no mail is sent.",
    steps: ["Row with contact, Status rejected, onboarding No"], sheet: one({ ...baseRow("VBU-125"), Status: "rejected" }),
    rows: [{ status: "success", verify: { bscm: "rejected", invitations: 1, invitationStatus: "rejected", minUsers: 1 } }],
    expected: "Row success; mapping rejected; invitation rejected (no mail); one user mapped to the vendor.", oracle: "BSCM + invitation + user_company_mappings.",
    rule: `${R.wrk}:28-35,159-171; ${R.send}:379-393`,
  },
  {
    id: "VBU-126", section: 4, feature: "vendorbulk.onboarding", kind: "bulk", tier: "creates", requires: { canSkip: true },
    title: "Status 'rejected' wins over 'Onboarding Required = Yes'", type: "Edge", priority: "P2", severity: "Medium",
    why: "Two routing columns disagree; rejected must win and nothing must be mailed.",
    steps: ["Status rejected, onboarding Yes"], sheet: one({ ...baseRow("VBU-126"), Status: "rejected", "Vendor Onboarding Required": "Yes" }),
    rows: [{ status: "success", verify: { bscm: "rejected", invitationStatus: "rejected" } }],
    expected: "Row success; mapping rejected; invitation rejected.", oracle: "BSCM.", rule: `${R.vpc}:241 (status != rejected)`,
  },
  {
    id: "VBU-127", section: 4, feature: "vendorbulk.onboarding", kind: "bulk", tier: "creates", requires: { canSkip: true },
    title: "' no ' (any case, spaces) skips onboarding", type: "Functional", priority: "P2", severity: "Low",
    why: "The worker trims and compares case-insensitively; a typed value must behave like the dropdown's.",
    steps: ["Onboarding Required = ' no '"], sheet: one({ ...baseRow("VBU-127"), "Vendor Onboarding Required": " no " }),
    rows: [{ status: "success", verify: { bscm: "active", skipOnboarding: true } }],
    expected: "Row success; vendor Active.", oracle: "BSCM.", rule: `${R.wrk}:66-71; ${R.val}:208-212`,
  },
  {
    id: "VBU-128", section: 4, feature: "vendorbulk.onboarding", kind: "bulk", tier: "creates",
    title: "POC 2 name without an email is refused BEFORE the vendor is created", type: "Negative", priority: "P1", severity: "High",
    why: "The POC 2 pair is only checked after the invite has run: the vendor and its invitation already exist when the row is marked failed. Re-uploading the corrected row then hits 'already exists'.",
    steps: ["Valid row (onboarding No) + POC 2 - Full Name, no POC 2 email", "POST", "Look for the vendor"],
    sheet: one({ ...baseRow("VBU-128"), "POC 2 - Full Name": "QA Second Contact" }),
    rows: [{ status: "failed", errorIncludes: MSG.POC2, verify: { absent: true } }],
    expected: "Row failed 'Invalid Values for POC 2.' and NO vendor created. Today: failed, but the vendor was created and invited.",
    oracle: "Job row + companies lookup.", rule: `${R.wrk}:141-158 (invite) then 175-179 (POC 2 check)`,
  },
  {
    id: "VBU-129", section: 4, feature: "vendorbulk.onboarding", kind: "bulk", tier: "creates", requires: { contactless: true, canSkip: true },
    title: "Contactless with an email but no POC name is invited with a blank name", type: "Edge", priority: "P1", severity: "Medium",
    why: "One half of a contact is the likeliest real-world legacy row. The PR skips the 'POC name is not present' check for the whole workspace, so the invite goes out with no name.",
    steps: ["Company Name + POC email, no POC name, onboarding No"], sheet: one({ "Company Name": vName("VBU-129"), "POC - Email Address": vEmail("VBU-129"), "Vendor Onboarding Required": "No" }),
    rows: [{ status: "success", verify: { bscm: "active", invitations: 1, invitationStatus: "active" } }],
    expected: "Row success with ONE invitation to the POC email and an empty POC name (the PR skips error 691 'POC name is not present' for every contactless-workspace invite). Worth a product decision: the invite mail greets nobody.",
    oracle: "Job row + invitation.", rule: `${R.prSend}:309 (name check skipped when contactless)`,
  },
  {
    id: "VBU-130", section: 4, feature: "vendorbulk.onboarding", kind: "bulk", tier: "creates", anyOrder: true, requires: { canSkip: true },
    title: "The same POC email on two rows (no tax number) — second row says 'already invited'", type: "Edge", priority: "P1", severity: "High",
    why: "Duplicate emails are deliberately allowed into staging (subsidiary flow). With no tax number or code the second row must be refused 688. Rows run in parallel workers, so both may pass the check — a race.",
    steps: ["Two valid rows (onboarding No), different names, same POC email", "POST"],
    sheet: { rows: [{ ...baseRow("VBU-130") }, { ...baseRow("VBU-130", 2), "POC - Email Address": vEmail("VBU-130") }] },
    rows: [{ status: "success" }, { status: "failed", errorIncludes: MSG.INVITED }],
    expected: "One row success, the other failed 'This email is already invited.'. Two successes = race defect.",
    oracle: "Job rows.", rule: `${R.helper}:686-703 (duplicates kept on purpose); ${R.send}:233-253`,
    disagree: "Lead said duplicate emails 'appear to be accepted' — confirmed intentional at staging (comment at companies_helper.rb:703); refused per row at invite time.",
  },
  {
    id: "VBU-131", section: 4, feature: "vendorbulk.onboarding", kind: "bulk", tier: "real-mail", baseline: "subsidiary", requires: { canSkip: true },
    title: "Same POC email with a tax number becomes a subsidiary — and keeps 'No'", type: "Edge", priority: "P1", severity: "High",
    why: "Error 689 routes to SubsidiaryService, whose invitation other_details has no skip_vendor_onboarding, so a non-PQ subsidiary still triggers the 'new prospect' mail. Real-mail tier because of exactly that mail.",
    setup: "Baseline (uploaded first): contact qa_vbu_{{stamp}}_sub@example.com, UK VAT {{vatG}}, onboarding No.",
    steps: ["Upload the baseline", "Upload a second row: same contact email, a different UK VAT, onboarding No", "Read the new vendor's mapping and invitation"],
    sheet: one({ ...baseRow("VBU-131"), "POC - Email Address": `qa_vbu_${S}_sub@example.com`, "Tax Type": "VAT", "Tax No.": "{{vatH}}", "Business Location": "United Kingdom" }),
    rows: [{ status: "success", verify: { bscm: "active", subsidiary: true, skipOnboarding: true } }],
    expected: "Row success as a subsidiary; mapping Active; its invitation carries skip_vendor_onboarding=true, so no prospect mail. Code today omits the flag.",
    oracle: "invitations.other_details of the subsidiary.", rule: `${R.send}:84-87; ${R.sub}:199-235; ${R.inv}:135-138`,
  },
  {
    id: "VBU-132", section: 4, feature: "vendorbulk.onboarding", kind: "bulk", tier: "safe", payload: "onboarding", requires: { onboardingV2: true },
    title: "An upload carrying an onboarding payload is accepted and still checks every row", type: "Functional", priority: "P2", severity: "Medium",
    why: "The API accepts configurations{order_type: vendor_onboarding} + forms beside excel_data (the web app never sends it). The payload adds a permission check; a tripwired row proves the rows are still validated and no event is created for a failed row.",
    steps: ["Resolve a vendor_onboarding template and its forms", "POST excel_data + configurations + forms with one tripwired row"],
    sheet: one(trip("VBU-132", {})), rows: tripped(),
    expected: "HTTP 200; the row failed 'Invalid Status'; no onboarding event for it.", oracle: "Job row.",
    rule: `${R.helper}:716-729; ${R.ctrl}:201-204; ${R.wrk}:195-197`,
    disagree: "Client never sends configurations/forms with the bulk upload (uploadExcelModal.jsx sends only excel_data).",
  },
  {
    id: "VBU-134", section: 4, feature: "vendorbulk.onboarding", kind: "bulk", tier: "real-mail", payload: "onboarding", requires: { onboardingV2: true, canSkip: true },
    title: "An onboarding payload starts onboarding for a 'Yes' row", type: "Functional", priority: "P2", severity: "Medium",
    why: "With the payload, each row that needs onboarding gets an onboarding event straight away — the vendor and evaluators are mailed, hence the real-mail tier.",
    steps: ["POST excel_data + configurations + forms with one row, onboarding Yes", "Read the vendor"],
    sheet: one({ ...baseRow("VBU-134"), "Vendor Onboarding Required": "Yes" }),
    rows: [{ status: "success", verify: { bscm: "invited", invitations: 1 } }],
    expected: "Row success; vendor in Prospects with an onboarding event started (Onboarding In Progress once the vendor opens it).",
    oracle: "Row + mapping; event visible under Start Onboarding.", rule: `${R.wrk}:195-197; app/workers/vendor_onboarding_event_worker.rb:10-41`,
  },
  {
    id: "VBU-133", section: 4, feature: "vendorbulk.onboarding", kind: "manualInvite", tier: "creates", requires: { contactless: true, canSkip: true }, qaDoc: ["D7"],
    title: "The manual Invite Vendor form still requires a contact on a contactless workspace", type: "Edge", priority: "P1", severity: "Medium",
    why: "contactless_vendor_record? looks only at the workspace flag, and SendService serves every invite path. The ordinary Invite Vendor form now accepts a blank POC name and email. Skip onboarding + no email keeps the test mail-free.",
    steps: ["POST /invitations/send_invite with a company name, city and address, no POC name, no email, skip_vendor_onboarding=true"],
    inviteBody: { invite_type: "vendor_invite", firm_name: vName("VBU-133"), name: "", email: "", category: "manufacturer", address: "QA Test Street 1", city_id: 8, skip_vendor_onboarding: true },
    inviteExpect: { http: "reject", message: "Email Not Present" },
    expected: "HTTP 422 'Email Not Present' (the form is for vendors with a contact). Today: the vendor is created with no invitation.",
    oracle: "HTTP status + companies lookup.", rule: `${R.prSend}:351-354 (workspace-wide), 309, 332, 457; app/controllers/api/invitations_controller.rb send_invite`,
    disagree: "QA doc D7: 'Manual Invite Vendor form, normal vendor → Unchanged'. The PR changes it for contactless workspaces.",
  },

  // ════════════ 5. duplicates ════════════
  ...dedupCases(),
  ...gapCases(),

  // ════════════ 6. data fidelity ════════════
  {
    id: "VBU-160", section: 6, feature: "vendorbulk.data", kind: "bulk", tier: "safe",
    title: "An address ending in zeros keeps them ('Plot No. 100')", type: "Edge", priority: "P1", severity: "High",
    why: "Every cell goes through strip_trailing_zero, meant for '84149090.0'. Any value that contains a dot and ends in zeros loses them: 'Plot No. 100' becomes 'Plot No. 1'.",
    steps: ["Tripwired row, Address 'Plot No. 100'", "Read the staged row's data"], sheet: one(trip("VBU-160", { Address: "Plot No. 100" })),
    rows: [{ status: "failed", error: MSG.STATUS, dataEquals: { Address: "Plot No. 100" } }],
    expected: "Staged Address = 'Plot No. 100'. Today: 'Plot No. 1'.", oracle: "vendor_bulk_upload_jobs.data.", rule: `${R.parse}:176; ${R.utils}:641-647`,
  },
  {
    id: "VBU-161", section: 6, feature: "vendorbulk.data", kind: "bulk", tier: "safe",
    title: "A company name ending in zeros keeps them ('… Pvt. Ltd 2000')", type: "Edge", priority: "P1", severity: "High",
    why: "Same stripper, on the vendor's legal name.", steps: ["Company Name ending 'Pvt. Ltd 2000'"],
    sheet: one(trip("VBU-161", { "Company Name": vName("VBU-161", " Pvt. Ltd 2000") })),
    rows: [{ status: "failed", error: MSG.STATUS, dataEquals: { "Company Name": vName("VBU-161", " Pvt. Ltd 2000") } }],
    expected: "Staged Company Name unchanged. Today: '… Pvt. Ltd 2'.", oracle: "Job data.", rule: `${R.utils}:641-647`,
  },
  {
    id: "VBU-162", section: 6, feature: "vendorbulk.data", kind: "bulk", tier: "safe",
    title: "A '<' in a company name does not cut the name short", type: "Edge", priority: "P1", severity: "Medium",
    why: "Every cell is passed through Nokogiri::HTML(...).text, which treats '<B Traders' as a tag and drops the rest.",
    steps: ["Company Name '… A<B Traders'"], sheet: one(trip("VBU-162", { "Company Name": vName("VBU-162", " A<B Traders") })),
    rows: [{ status: "failed", error: MSG.STATUS, dataEquals: { "Company Name": vName("VBU-162", " A<B Traders") } }],
    expected: "Staged name unchanged. Today: truncated at '<'.", oracle: "Job data.", rule: `${R.parse}:177`,
  },
  {
    id: "VBU-163", section: 6, feature: "vendorbulk.data", kind: "bulk", tier: "safe",
    title: "Script tags in a name are neutralised", type: "Security", priority: "P1", severity: "Medium",
    why: "Vendor names are rendered in lists, mails and PDFs. The HTML pass should leave no tag behind.",
    steps: ["Company Name '<script>alert(1)</script>QA_Platform_…'"], sheet: one(trip("VBU-163", { "Company Name": `<script>alert(1)</script>${vName("VBU-163")}` })),
    rows: [{ status: "failed", error: MSG.STATUS, dataExcludes: { "Company Name": "<script" } }],
    expected: "Staged name has no '<script'.", oracle: "Job data.", rule: `${R.parse}:177`,
  },
  {
    id: "VBU-164", section: 6, feature: "vendorbulk.data", kind: "formulaSheet", tier: "safe",
    title: "A name starting with '=' comes back as text in the error sheet, not as a live formula", type: "Security", priority: "P1", severity: "High",
    why: "CSV/formula injection: the error sheet is written with axlsx, which turns a string starting with '=' into a formula. A buyer opening it runs whatever the uploader wrote.",
    steps: ["Tripwired row, Company Name '=HYPERLINK(\"https://example.com\",\"QA\")'", "Download the job's error sheet", "Inspect the name cell"],
    sheet: one(trip("VBU-164", { "Company Name": '=HYPERLINK("https://example.com","QA_Platform_VBU")' })),
    rows: tripped(),
    expected: "The cell is a plain string (or escaped with a leading ').", oracle: "Cell type in the downloaded error sheet.",
    rule: `${R.tpl}:336-359 (sheet.add_row row — axlsx type detection)`,
  },
  {
    id: "VBU-165", section: 6, feature: "vendorbulk.data", kind: "bulk", tier: "safe",
    title: "A 17-digit bank account number typed as a number is not turned into scientific notation", type: "Edge", priority: "P1", severity: "Medium",
    why: "Indian bank accounts run to 17 digits. Typed into Excel as a number, the cell reaches Roo as a Float, and Ruby prints a Float of 17+ digits as '1.23456789012345e+16' — that string is what gets stored. (Excel itself keeps only 15 significant digits, so the cell should be text; the product should refuse or warn rather than store scientific notation.)",
    steps: ["Bank Account Number = 12345678901234500 as a NUMBER cell"], sheet: one(trip("VBU-165", { "Bank Account Number": 12345678901234500 })),
    rows: [{ status: "failed", error: MSG.STATUS, dataEquals: { "Bank Account Number": "12345678901234500" } }],
    expected: "Staged value '12345678901234500' (or the row refused as not text).", oracle: "Job data.", rule: `${R.parse}:176`,
  },
  {
    id: "VBU-166", section: 6, feature: "vendorbulk.data", kind: "bulk", tier: "safe",
    title: "A pincode typed as a number is stored as the plain digits", type: "Functional", priority: "P2", severity: "Low",
    why: "The common case the trailing-zero fix was written for ('560001.0').", steps: ["Pincode = 560001 as a NUMBER cell"],
    sheet: one(trip("VBU-166", { Pincode: 560001 })), rows: [{ status: "failed", error: MSG.STATUS, dataEquals: { Pincode: "560001" } }],
    expected: "Staged Pincode '560001'.", oracle: "Job data.", rule: `${R.utils}:641-647`,
  },
  {
    id: "VBU-167", section: 6, feature: "vendorbulk.data", kind: "bulk", tier: "safe",
    title: "An ampersand in a name survives ('R & D')", type: "Functional", priority: "P3", severity: "Low",
    why: "Pins that the HTML pass leaves a plain '&' alone.", steps: ["Company Name '… R & D'"],
    sheet: one(trip("VBU-167", { "Company Name": vName("VBU-167", " R & D") })),
    rows: [{ status: "failed", error: MSG.STATUS, dataEquals: { "Company Name": vName("VBU-167", " R & D") } }],
    expected: "Staged name unchanged.", oracle: "Job data.", rule: `${R.parse}:177`,
  },

  // ════════════ 7. settings on other workspaces ════════════
  {
    id: "VBU-180", section: 7, feature: "vendorbulk.settings", kind: "bulk", tier: "safe", requires: { contactless: false },
    title: "Contactless OFF: a blank POC email is still mandatory", type: "Negative", priority: "P0", severity: "High",
    why: "Suite D: every other client must behave exactly as before the PR.", steps: ["Tripwired row with POC email blank (plus the workspace's required extra columns)"],
    sheet: one(trip("VBU-180", { "POC - Email Address": "", ...PD_REQUIRED })), rows: fails(MSG.MAND),
    expected: "Row failed 'Mandatory Item cannot be left empty'.", oracle: "Job row error.", rule: `${R.utils}:795-802`,
  },
  {
    id: "VBU-181", section: 7, feature: "vendorbulk.settings", kind: "bulk", tier: "safe", requires: { contactless: false, invitationV2: false },
    title: "Contactless OFF: no tax number and no city/address is refused", type: "Negative", priority: "P0", severity: "High",
    why: "The 'With Tax No. OR Without Tax No.' rule must still hold.", steps: ["Tripwired row, City and Address blank"],
    sheet: one(trip("VBU-181", { City: "", Address: "", ...PD_REQUIRED })), rows: fails(MSG.EITHER),
    expected: "Row failed 'Either Tax No. or Without Tax No. fields are needed'.", oracle: "Job row error.", rule: `${R.val}:24-30,46-48`,
  },
  {
    id: "VBU-182", section: 7, feature: "vendorbulk.settings", kind: "bulk", tier: "safe", requires: { requiredExtraFields: true },
    title: "A required extra field left blank is refused", type: "Negative", priority: "P1", severity: "Medium",
    why: "extra_fields_for_vendor_invite with is_required=true is drawn under Mandatory Details in the template (PROCOL DEMO: Contact Number, Feedback Score, Feedback Report, Non-PQ Remark). The validator, though, builds its column list WITHOUT the extra fields, so the requirement is never checked on upload.",
    steps: ["Tripwired row with the required extra fields blank"], sheet: one(trip("VBU-182", {})), rows: fails(MSG.MAND),
    expected: "Row failed 'Mandatory Item cannot be left empty'. Found 2026-09-29: passes validation ('Invalid Status' tripwire) — the rule is not enforced.",
    oracle: "Job row error.", rule: `${R.prVal}:14-16 (get_vendor_bulk_upload_params_v2 called with no extra_fields:) vs ${R.tpl}:9-13 (template passes them); ${R.utils}:803-806`,
    disagree: "The template tells the buyer these columns are mandatory; the upload does not require them.",
  },
  {
    id: "VBU-184", section: 7, feature: "vendorbulk.settings", kind: "bulk", tier: "creates", requires: { contactless: false, canSkip: true }, qaDoc: ["D2"],
    title: "Contactless OFF: a normal vendor with full details is created and invited", type: "Functional", priority: "P0", severity: "High",
    why: "QA doc D2 on a client without GMMCO's switch: the everyday path must be unchanged, including the new PAN No. and Pincode columns.",
    steps: ["Row with every mandatory column, UK VAT, PAN, pincode, the workspace's required extra fields, onboarding No"],
    sheet: one({ ...baseRow("VBU-184"), ...PD_REQUIRED, "Tax Type": "VAT", "Tax No.": "{{vatA}}", "Business Location": "United Kingdom", Pincode: "400004", "PAN No.": "{{pan}}" }),
    rows: [{ status: "success", verify: { bscm: "active", invitations: 1, invitationStatus: "active", skipOnboarding: true, fields: { pan_no: "{{pan}}", "misc.pincode": "400004" } } }],
    expected: "Row success; vendor Active; one invitation (skip onboarding); PAN and pincode stored.", oracle: "Vendor, mapping, invitation.",
    rule: `${R.wrk}:92-158; ${R.prMixin}:42-47`,
  },
  {
    id: "VBU-183", section: 7, feature: "vendorbulk.settings", kind: "bulk", tier: "safe", requires: { contactless: false },
    title: "Contactless OFF: the invalid-city rule still fires", type: "Negative", priority: "P1", severity: "Medium",
    why: "Old behaviour, which the PR's A5 change must not leak to other workspaces. The tripwire is not needed: the city check is last, and a valid Status=rejected row stays mail-free if it passes.",
    steps: ["Status rejected, no Tax No., City 'QA Nowhere {{stamp}}'"], sheet: one({ ...baseRow("VBU-183"), ...PD_REQUIRED, Status: "rejected", City: `QA Nowhere ${S}` }),
    rows: fails(MSG.CITY), expected: "Row failed 'Invalid City Name'.", oracle: "Job row error.", rule: `${R.val}:73-75`,
  },
];

// ── which QA-doc case each case covers (for the report's comparison table) ──
/** The PR's QA document "Vendor bulk upload + dedup — QA test cases", case by case. */
export const QA_DOC: Record<string, { what: string; cases: string[] }> = {
  A1: { what: "Company Name only", cases: ["VBU-121", "VBU-122"] },
  A2: { what: "GST + city + address + pincode, no contact; PAN derived", cases: ["VBU-060", "VBU-120"] },
  A3: { what: "Contact email 'not-an-email'", cases: ["VBU-055"] },
  A4: { what: "Company Name blank", cases: ["VBU-050"] },
  A5: { what: "City not in the city list", cases: ["VBU-075", "VBU-154"] },
  A6: { what: "Contact name + email gets an invite", cases: ["VBU-119"] },
  A7: { what: "Account Group + MSME + bank stored", cases: ["VBU-119", "VBU-112"] },
  "A-no-mail": { what: "No email for contactless rows", cases: ["VBU-121", "VBU-122"] },
  "A-flag-off": { what: "Flag off → a Company-Name-only row fails", cases: ["VBU-180"] },
  B1: { what: "Same tax no. + address + pincode → blocked", cases: ["VBU-140"] },
  B2: { what: "Different pincode → allowed", cases: ["VBU-141"] },
  B3: { what: "Different address → allowed", cases: ["VBU-142"] },
  B4: { what: "Pincode blank → blocked", cases: ["VBU-143"] },
  B5: { what: "Pincode '560 001' → blocked", cases: ["VBU-144"] },
  B6: { what: "Different tax no. → allowed", cases: ["VBU-145"] },
  B7: { what: "Same vendor code → blocked", cases: ["VBU-146"] },
  "B-form": { what: "B1–B3 through the manual Invite form give the same answer", cases: ["VBU-135", "VBU-136"] },
  "B-city": { what: "City blank copies the old address", cases: ["VBU-152", "VBU-153"] },
  "B-prospect": { what: "A Prospect is visible to the duplicate check", cases: ["VBU-155"] },
  C1: { what: "All four fields match → blocked", cases: ["VBU-140"] },
  C2: { what: "Account Group different → allowed", cases: ["VBU-147"] },
  C3: { what: "Account Group blank → blocked", cases: ["VBU-148"] },
  C4: { what: "Account Group lower case → blocked", cases: ["VBU-149"] },
  C5: { what: "Config without gst_no → old rule", cases: ["VBU-159"] },
  C6: { what: "Config with an unknown field → old rule", cases: ["VBU-138"] },
  C7: { what: "Config absent → old rule", cases: ["VBU-156", "VBU-157", "VBU-158"] },
  D1: { what: "Template for a normal client", cases: ["VBU-030", "VBU-180"] },
  D2: { what: "Normal vendor with full details", cases: ["VBU-184", "VBU-119"] },
  D3: { what: "Contact email blank on a normal client", cases: ["VBU-180"] },
  D4: { what: "Tax number already registered", cases: ["VBU-158"] },
  D5: { what: "Same-GST-multiple-addresses client", cases: ["VBU-156", "VBU-157"] },
  D6: { what: "Vendor Onboarding Required column", cases: ["VBU-105", "VBU-106", "VBU-107", "VBU-108", "VBU-121", "VBU-127"] },
  D7: { what: "Manual Invite Vendor form", cases: ["VBU-133"] },
};

// ── duplicates: one shared baseline, then one variation per case ─────────

/** The vendor every duplicate case is compared with (created once per run, onboarding No). */
export function dedupBaselineRow(): Record<string, Cell> {
  return {
    ...baseRow("VBU-DUP-BASE"),
    "Company Name": vName("DUPBASE"),
    "POC - Email Address": `qa_vbu_${S}_dupbase@example.com`,
    "Tax Type": "VAT",
    "Tax No.": "{{vatB}}",
    "Business Location": "United Kingdom",
    Address: "QA Dedup Road 12",
    Pincode: "560001",
    "Account Group": "ZCOV",
    "Vendor Code": `QAVC${S}`,
  };
}

/** VBU-154's baseline: a contactless vendor with a tax number and an unknown city (stored as city_id 0). */
export function cityZeroBaselineRow(): Record<string, Cell> {
  return {
    "Company Name": vName("CITYZERO"),
    "POC - Full Name": "QA Platform Tester",
    "POC - Email Address": `qa_vbu_${S}_cityzero@example.com`,
    "Tax Type": "VAT",
    "Tax No.": "{{vatF}}",
    "Business Location": "United Kingdom",
    City: `QA Nowhere ${S}`,
    Address: "QA City Zero Road 1",
    "Vendor Onboarding Required": "No",
  };
}

/** VBU-131's baseline: a vendor whose contact email the subsidiary row will reuse. */
export function subsidiaryBaselineRow(): Record<string, Cell> {
  return { ...baseRow("VBU-SUB-BASE"), "Company Name": vName("SUBBASE"), "POC - Email Address": `qa_vbu_${S}_sub@example.com`,
    "Tax Type": "VAT", "Tax No.": "{{vatG}}", "Business Location": "United Kingdom" };
}
/** VBU-155's baseline: a contactless Prospect — no email, so no invitation and no mail. */
export function prospectBaselineRow(): Record<string, Cell> {
  return { "Company Name": vName("PROSPECTBASE"), "Tax Type": "VAT", "Tax No.": "{{vatI}}", "Business Location": "United Kingdom",
    City: "Mumbai", Address: "QA Prospect Road 3", Pincode: "560003", "Account Group": "ZCOV" };
}
/** VBU-156/157/158's baseline, for workspaces WITHOUT vendor_duplicate_check_fields (the old rules). */
export function fallbackBaselineRow(): Record<string, Cell> {
  return { ...baseRow("VBU-FB-BASE"), ...PD_REQUIRED, "Company Name": vName("FALLBACKBASE"), "POC - Email Address": `qa_vbu_${S}_fallback@example.com`,
    "Tax Type": "VAT", "Tax No.": "{{vatJ}}", "Business Location": "United Kingdom", Address: "QA Fallback Road 4" };
}

function dedupCases(): VbuCase[] {
  const req: Requires = { dupFieldsInclude: ["gst_no", "address", "pincode"], canSkip: true };
  const withAg: Requires = { ...req, dupFieldsInclude: ["gst_no", "address", "pincode", "account_group"] };
  const rule = `${R.prSend}:274-298 (duplicate_code_for_repeated_tax_no); ${R.prDup}:23-32,111-119 (address blank=no match; pincode & extra fields blank=match)`;
  const mk = (
    id: string, title: string, change: Record<string, Cell>, blocked: boolean, why: string, pri: VbuCase["priority"], requires = req,
    message = MSG.DUP_ADDR,
  ): VbuCase => {
    const base = dedupBaselineRow();
    const row: Record<string, Cell> = {
      ...base,
      "Company Name": vName(id),
      "POC - Email Address": vEmail(id),
      "Vendor Code": "",
      ...change,
    };
    return {
      id, section: 5, feature: "vendorbulk.dedup", kind: "bulk", tier: "creates", baseline: "dedup", requires,
      title, type: blocked ? "Negative" : "Functional", priority: pri, severity: pri === "P0" ? "Critical" : "High",
      why, setup: "The shared baseline vendor exists: tax number {{vatB}} (UK VAT — the duplicate key reads companies.gst_no whatever the tax type, and the sandbox's 'India' rows block GST, see VBU-059), Address 'QA Dedup Road 12', Pincode 560001, City Mumbai, Account Group ZCOV, Vendor Code QAVC{{stamp}}.",
      steps: ["Upload the variation row (onboarding No)", "Read the row and look for the vendor"],
      sheet: one(row),
      rows: blocked ? [{ status: "failed", errorIncludes: message, verify: { absent: true } }] : [{ status: "success", verify: { bscm: "active" } }],
      expected: blocked ? `Row failed '${message}'; no second vendor.` : "Row success; a second, separate vendor is created (Active).",
      oracle: "Job row + companies lookup.", rule,
    };
  };
  return [
    mk("VBU-140", "Same GST + address + pincode + account group is blocked", {}, true, "The exact duplicate — QA doc B1/C1.", "P0", withAg),
    mk("VBU-141", "Same GST + address, different pincode is allowed (another branch)", { Pincode: "110001" }, false, "QA doc B2 — the case GMMCO reported as wrongly blocked.", "P0"),
    mk("VBU-142", "Same GST, different address is allowed", { Address: "QA Other Road 99" }, false, "QA doc B3; also the allow_same_gst_multiple_addresses rule.", "P0"),
    mk("VBU-143", "Same GST + address, pincode blank is blocked", { Pincode: "" }, true, "QA doc B4: a missing pincode must never rescue a duplicate.", "P0"),
    mk("VBU-144", "Pincode with a space ('560 001') is treated as the same pincode", { Pincode: "560 001" }, true, "QA doc B5: normalised to digits before comparing.", "P1"),
    mk("VBU-145", "Different GST, everything else identical is allowed", { "Tax No.": "{{vatC}}" }, false, "QA doc B6: the rule only applies once GST matches.", "P1"),
    mk("VBU-146", "An existing vendor code is blocked", { "Tax No.": "{{vatD}}", "Vendor Code": `QAVC${S}` }, true, "QA doc B7: vendor codes are unique per workspace.", "P0", req, MSG.CODE_TAKEN),
    mk("VBU-147", "A different account group releases the block", { "Account Group": "ZDGS" }, false, "QA doc C2: account_group is part of GMMCO's key.", "P1", withAg),
    mk("VBU-148", "A blank account group never rescues a duplicate", { "Account Group": "" }, true, "QA doc C3.", "P1", withAg),
    mk("VBU-149", "Account group in lower case ('zcov') still matches", { "Account Group": "zcov" }, true, "QA doc C4: compared case-insensitively.", "P2", withAg),
    mk("VBU-150", "The same address with different case and spacing still matches", { Address: "qa  dedup ROAD 12" }, true, "same_address? downcases and squishes; a re-typed address must not slip through.", "P1"),
    {
      id: "VBU-151", section: 5, feature: "vendorbulk.dedup", kind: "bulk", tier: "creates", requires: req, anyOrder: true,
      title: "Two identical new vendors in ONE sheet — only one is created", type: "Edge", priority: "P0", severity: "Critical",
      why: "Each row runs in its own Sidekiq worker; the duplicate check reads committed rows only, so two identical rows processed together can both pass. The QA doc expects most of an 11,000-row load to be duplicates.",
      steps: ["Two rows, same new tax number {{vatE}}, same address and pincode, different emails", "POST", "Read both rows"],
      sheet: {
        rows: [
          { ...baseRow("VBU-151"), "Tax Type": "VAT", "Tax No.": "{{vatE}}", "Business Location": "United Kingdom", Address: "QA Twin Road 5", Pincode: "560002", "Account Group": "ZCOV" },
          { ...baseRow("VBU-151", 2), "Tax Type": "VAT", "Tax No.": "{{vatE}}", "Business Location": "United Kingdom", Address: "QA Twin Road 5", Pincode: "560002", "Account Group": "ZCOV" },
        ],
      },
      rows: [{ status: "success" }, { status: "failed", errorIncludes: MSG.DUP_ADDR }],
      expected: "One row success, one failed 'Vendor with this GST and address already exists'. Two successes = race defect.",
      oracle: "Job rows.", rule: `${R.send}:258-290; ${R.wrk} (one job per row, parallel)`,
    },
    {
      ...mk("VBU-152", "Same GST with City blank copies the existing vendor's address — and is blocked", { City: "" }, true,
        "QA doc: 'If City is blank, the invite flow copies the address from the existing vendor with that GST'. It also copies the existing vendor's NAME over the one in the sheet.", "P2"),
      rule: `${R.send}:41-54 (GST lookup only when city/address missing); ${R.helper}:731-745 (existing company's name/address/city merged)`,
    },
    {
      ...mk("VBU-153", "Same GST with the address left blank is back-filled from the existing vendor — and blocked", { Address: "" }, true,
        "An address blank on the sheet makes the invite look the GSTIN up and copy the existing vendor's address in (the PR spec calls this 'back-filled'), so a blank address can never sneak a duplicate through.", "P1"),
      rule: `${R.send}:41-54; ${R.prDup}:26 (address: blank = no match — only safe because of the back-fill)`,
    },
    {
      ...mk("VBU-155", "A contactless Prospect is seen by the duplicate check", { "Tax No.": "{{vatI}}", Address: "QA Prospect Road 3", Pincode: "560003", "Account Group": "ZCOV" }, true,
        "QA doc 'Prospect visibility': before the PR a Prospect was invisible to the check and a second vendor code was minted. The baseline is a contactless Prospect (no email → no invitation → no mail).", "P0", withAg),
      baseline: "prospect", requires: { ...withAg, contactless: true },
      setup: "Baseline (uploaded first): a contactless Prospect — UK VAT {{vatI}}, 'QA Prospect Road 3', pincode 560003, account group ZCOV, no contact.",
      qaDoc: ["B-prospect"],
    },
    {
      id: "VBU-156", section: 5, feature: "vendorbulk.dedup", kind: "bulk", tier: "creates", baseline: "fallback", requires: { dupFieldsEmpty: true, sameGstMulti: true, canSkip: true }, qaDoc: ["D5"],
      title: "Old rule, same-GST-multiple-addresses ON: same tax number + same address is blocked", type: "Negative", priority: "P1", severity: "High",
      why: "Workspaces without vendor_duplicate_check_fields keep the old rule (QA doc D5): same GST at the same address → 1111.",
      setup: "Baseline: UK VAT {{vatJ}}, 'QA Fallback Road 4'. Runs only on a workspace with allow_same_gst_multiple_addresses_vendor_invite on and no duplicate field list.",
      steps: ["Upload the baseline", "Upload a row with the same tax number and address"],
      sheet: one({ ...fallbackBaselineRow(), "Company Name": vName("VBU-156"), "POC - Email Address": vEmail("VBU-156") }),
      rows: [{ status: "failed", errorIncludes: MSG.DUP_ADDR, verify: { absent: true } }],
      expected: "Row failed 'Vendor with this GST and address already exists'.", oracle: "Job row.", rule: `${R.prSend}:288-298 (fallback branch)`,
    },
    {
      id: "VBU-157", section: 5, feature: "vendorbulk.dedup", kind: "bulk", tier: "creates", baseline: "fallback", requires: { dupFieldsEmpty: true, sameGstMulti: true, canSkip: true }, qaDoc: ["D5"],
      title: "Old rule, same-GST-multiple-addresses ON: same tax number at another address is allowed", type: "Functional", priority: "P1", severity: "High",
      why: "The other half of D5.", setup: "As VBU-156.",
      steps: ["Upload a row with the same tax number and a different address"],
      sheet: one({ ...fallbackBaselineRow(), "Company Name": vName("VBU-157"), "POC - Email Address": vEmail("VBU-157"), Address: "QA Other Fallback Road 9" }),
      rows: [{ status: "success", verify: { bscm: "active" } }],
      expected: "Row success; a second vendor.", oracle: "Job row + vendor.", rule: `${R.prSend}:288-298`,
    },
    {
      id: "VBU-158", section: 5, feature: "vendorbulk.dedup", kind: "bulk", tier: "creates", baseline: "fallback", requires: { dupFieldsEmpty: true, sameGstMulti: false, canSkip: true }, qaDoc: ["D4"],
      title: "Old rule, same-GST-multiple-addresses OFF: any repeated tax number is blocked", type: "Negative", priority: "P0", severity: "High",
      why: "QA doc D4 — the behaviour every other client has today. Runs on PROCOL DEMO with a UK VAT number because GST rows are blocked by the sandbox's 'India' data (VBU-059).",
      setup: "As VBU-156, on a workspace with allow_same_gst_multiple_addresses_vendor_invite off.",
      steps: ["Upload a row with the same tax number and a different address"],
      sheet: one({ ...fallbackBaselineRow(), "Company Name": vName("VBU-158"), "POC - Email Address": vEmail("VBU-158"), Address: "QA Other Fallback Road 9" }),
      rows: [{ status: "failed", errorIncludes: "Tax no. already registered with another company", verify: { absent: true } }],
      expected: "Row failed 'Tax no. already registered with another company' (error 134).", oracle: "Job row.", rule: `${R.prSend}:295-296; ${R.loc} api_errors.134`,
    },
    {
      id: "VBU-159", section: 5, feature: "vendorbulk.dedup", kind: "bulk", tier: "creates", baseline: "dedup", requires: { dupFieldsState: "no-anchor", canSkip: true }, qaDoc: ["C5"],
      title: "A duplicate-field list without gst_no is ignored (old rule applies)", type: "Negative", priority: "P1", severity: "High",
      why: "QA doc C5: an unusable config must fall back to the old behaviour, never let everything through. Runs only where such a config exists.",
      steps: ["Upload the exact duplicate of the baseline"],
      sheet: one({ ...dedupBaselineRow(), "Company Name": vName("VBU-159"), "POC - Email Address": vEmail("VBU-159"), "Vendor Code": "" }),
      rows: [{ status: "failed", verify: { absent: true } }],
      expected: "Row blocked (1111 or 134, per allow_same_gst_multiple_addresses_vendor_invite); config rejection logged.", oracle: "Job row.", rule: `${R.prDup}:58-82`,
    },
    {
      id: "VBU-138", section: 5, feature: "vendorbulk.dedup", kind: "bulk", tier: "creates", baseline: "dedup", requires: { dupFieldsState: "unknown-field", canSkip: true }, qaDoc: ["C6"],
      title: "A duplicate-field list naming an unknown field is ignored (old rule applies)", type: "Negative", priority: "P1", severity: "High",
      why: "QA doc C6: the unknown field must not be silently skipped. Runs only where such a config exists.",
      steps: ["Upload the exact duplicate of the baseline"],
      sheet: one({ ...dedupBaselineRow(), "Company Name": vName("VBU-138"), "POC - Email Address": vEmail("VBU-138"), "Vendor Code": "" }),
      rows: [{ status: "failed", verify: { absent: true } }],
      expected: "Row blocked by the old rule.", oracle: "Job row.", rule: `${R.prDup}:71-82`,
    },
    {
      id: "VBU-135", section: 5, feature: "vendorbulk.dedup", kind: "manualInvite", tier: "creates", baseline: "dedup", requires: req, qaDoc: ["B1-form"],
      title: "Manual Invite form: exact duplicate of an existing vendor is blocked", type: "Negative", priority: "P0", severity: "High",
      why: "QA doc: 'Run B1, B2 and B3 twice — once through bulk upload, once through the manual Invite Vendor form. A difference between them is a bug.'",
      setup: "The shared duplicate baseline exists (UK VAT {{vatB}}, 'QA Dedup Road 12', pincode 560001, ZCOV).",
      steps: ["POST /invitations/send_invite with the baseline's tax number, address and account group, a new name and email, skip onboarding"],
      inviteBody: { invite_type: "vendor_invite", firm_name: vName("VBU-135"), name: "QA Platform Tester", email: vEmail("VBU-135"), category: "manufacturer", tax_no: "{{vatB}}", tax_type_country_mapping_id: 1, address: "QA Dedup Road 12", city_id: 8, account_group: "ZCOV", skip_vendor_onboarding: true },
      inviteExpect: { http: "reject", message: MSG.DUP_ADDR, verify: { absent: true } },
      expected: "HTTP 422 'Vendor with this GST and address already exists' — the same answer as bulk (VBU-140).", oracle: "HTTP + companies lookup.", rule: `${R.prSend}:274-298`,
    },
    {
      id: "VBU-136", section: 5, feature: "vendorbulk.dedup", kind: "manualInvite", tier: "creates", baseline: "dedup", requires: req, qaDoc: ["B2-form"],
      title: "Manual Invite form: same tax number + address, different pincode is allowed", type: "Functional", priority: "P0", severity: "High",
      why: "QA doc B2 through the form. The form's allowed parameters do not include pincode, so it may not be able to tell two branches apart.",
      setup: "As VBU-135.",
      steps: ["POST /invitations/send_invite with the baseline's tax number and address, pincode 110001, a new name and email, skip onboarding"],
      inviteBody: { invite_type: "vendor_invite", firm_name: vName("VBU-136"), name: "QA Platform Tester", email: vEmail("VBU-136"), category: "manufacturer", tax_no: "{{vatB}}", tax_type_country_mapping_id: 1, address: "QA Dedup Road 12", city_id: 8, pincode: "110001", account_group: "ZCOV", skip_vendor_onboarding: true },
      inviteExpect: { http: "accept", verify: { bscm: "active" } },
      expected: "HTTP 200; a second vendor (another branch) — the same answer as bulk (VBU-141).", oracle: "HTTP + vendor.",
      rule: `app/controllers/api/invitations_controller.rb send_invite (permit list has no :pincode); ${R.prDup}:27 (blank pincode = match)`,
    },
  ];
}

// ════════════ 8. gaps from the coverage audit (2026-10-05) ════════════
// The audit mapped 161 scenarios the backend allows (PR 16267 @65728150bc)
// against the cases above; these are the ones no case covered. Runnable ones
// create nothing or only QA_Platform_ test vendors with no mail to real people;
// the rest are listed with the reason they do not run.

/** GAP-36's baseline: a legacy-style vendor with NO pincode. */
export function noPincodeBaselineRow(): Record<string, Cell> {
  return { ...baseRow("VBU-NOPIN-BASE"), "Company Name": vName("NOPINBASE"), "POC - Email Address": `qa_vbu_${S}_nopin@example.com`,
    "Tax Type": "VAT", "Tax No.": "{{vatK}}", "Business Location": "United Kingdom", Address: "QA Legacy Road 6", "Account Group": "ZCOV" };
}
/** GAP-37's baseline: the vendor whose address a blank-address row is back-filled from. */
export function backfillBaselineRow(): Record<string, Cell> {
  return { ...baseRow("VBU-BACKFILL-BASE"), "Company Name": vName("BACKFILLBASE"), "POC - Email Address": `qa_vbu_${S}_backfill@example.com`,
    "Tax Type": "VAT", "Tax No.": "{{vatL}}", "Business Location": "United Kingdom", Address: "QA Backfill Road 7", Pincode: "560007", "Account Group": "ZCOV" };
}
/** GAP-38's baseline: a REJECTED vendor (Status rejected: no mail). */
export function rejectedDupBaselineRow(): Record<string, Cell> {
  return { ...baseRow("VBU-REJ-BASE"), "Company Name": vName("REJBASE"), "POC - Email Address": `qa_vbu_${S}_rejbase@example.com`, Status: "rejected",
    "Tax Type": "VAT", "Tax No.": "{{vatM}}", "Business Location": "United Kingdom", Address: "QA Rejected Road 8", Pincode: "560008", "Account Group": "ZCOV" };
}
/** GAP-20/21/22's baseline: a vendor with a VRP Code and its own Vendor Code, no tax number. */
export function vrpBaselineRow(): Record<string, Cell> {
  return { ...baseRow("VBU-VRP-BASE"), "Company Name": vName("VRPBASE"), "POC - Email Address": `qa_vbu_${S}_vrpbase@example.com`,
    "VRP Code": `QAVRP${S}`, "Vendor Code": `QAVCR${S}` };
}

function gapCases(): VbuCase[] {
  const dupReq: Requires = { dupFieldsInclude: ["gst_no", "address", "pincode", "account_group"], canSkip: true };
  const pd: Requires = { contactless: false, invitationV2: false, canSkip: true };
  const approval = (id: string, title: string, why: string, steps: string[], expected: string, rule: string, reason: string,
    extra: Partial<VbuCase> = {}): VbuCase => ({
    id, section: 8, feature: "vendorbulk.onboarding", kind: "manual", tier: "real-mail", verdict: "manual", manualReason: reason,
    title, type: "Functional", priority: "P1", severity: "High", why, steps, expected, oracle: "Job row + records (SELECT).", rule, ...extra,
  });
  return [
    // ── row rules on a workspace WITHOUT contactless (PROCOL DEMO) ──
    {
      id: "VBU-200", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "creates", requires: pd,
      title: "Contactless OFF: a tax number with an unknown city is refused, not saved as city 0", type: "Negative", priority: "P1", severity: "Medium",
      why: "Coverage audit GAP-07. 'Invalid City Name' fires only when Tax No. is blank (val:77); with a tax number the unknown city name is cast to city_id 0 — BUG-10 reached on a normal workspace. Status rejected keeps the row mail-free if it is wrongly created.",
      steps: ["Row with UK VAT {{vatK}}, City 'QA Nowhere <stamp>', Status rejected, PD's required extra fields", "POST", "Read the row and the vendor"],
      sheet: one({ ...baseRow("VBU-200"), ...PD_REQUIRED, Status: "rejected", "Tax Type": "VAT", "Tax No.": "{{vatK}}", "Business Location": "United Kingdom", City: `QA Nowhere ${S}` }),
      rows: [{ status: "failed", error: MSG.CITY, verify: { absent: true } }],
      expected: "Row failed 'Invalid City Name'; no vendor. Per the code: success and the vendor saved with city_id 0.",
      oracle: "Job row + companies lookup.", rule: `${R.prVal}:35-37,77; ${R.prUtils}:892; ${R.prMixin}:27`,
    },
    {
      id: "VBU-201", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "safe", requires: pd,
      title: "Contactless OFF: a blank Vendor Profile is refused as mandatory", type: "Validation", priority: "P1", severity: "Medium",
      why: "Coverage audit GAP-08: the mandatory rule for Vendor Profile (utils:803-805) had no case on a normal workspace.",
      steps: ["Tripwired row with Vendor Profile blank"], sheet: one(trip("VBU-201", { "Vendor Profile": "", ...PD_REQUIRED })), rows: fails(MSG.MAND),
      expected: "Row failed 'Mandatory Item cannot be left empty'.", oracle: "Job row error.", rule: `${R.prUtils}:803-805; ${R.prVal}:33,56-58`,
    },
    {
      id: "VBU-202", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "safe", requires: pd,
      title: "Contactless OFF: a blank POC - Full Name is refused as mandatory", type: "Validation", priority: "P1", severity: "Medium",
      why: "Coverage audit GAP-09.", steps: ["Tripwired row with POC - Full Name blank"],
      sheet: one(trip("VBU-202", { "POC - Full Name": "", ...PD_REQUIRED })), rows: fails(MSG.MAND),
      expected: "Row failed 'Mandatory Item cannot be left empty'.", oracle: "Job row error.", rule: `${R.prUtils}:801-802`,
    },
    {
      id: "VBU-203", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "safe", requires: pd,
      title: "Contactless OFF: no tax number and no Address is refused ('Either Tax No. or …')", type: "Validation", priority: "P2", severity: "Low",
      why: "Coverage audit GAP-10: without a tax number, City AND Address are both needed.", steps: ["Tripwired row with Address blank, no tax"],
      sheet: one(trip("VBU-203", { Address: "", ...PD_REQUIRED })), rows: fails(MSG.EITHER),
      expected: "Row failed 'Either Tax No. or Without Tax No. fields are needed'.", oracle: "Job row error.", rule: `${R.prVal}:27-31,51`,
    },
    {
      id: "VBU-204", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "safe", requires: pd,
      title: "Contactless OFF: Tax Type and Business Location filled but Tax No. blank", type: "Edge", priority: "P3", severity: "Low",
      why: "Coverage audit GAP-54: with Tax No. blank the tax columns are ignored and the no-tax rule applies.",
      steps: ["Tripwired row: Tax Type GST, Business Location India, Tax No., City and Address blank"],
      sheet: one(trip("VBU-204", { "Tax Type": "GST", "Business Location": "India", City: "", Address: "", ...PD_REQUIRED })), rows: fails(MSG.EITHER),
      expected: "Row failed 'Either Tax No. or Without Tax No. fields are needed'.", oracle: "Job row error.", rule: `${R.prVal}:24-31`,
    },
    // ── row rules, every workspace ──
    {
      id: "VBU-205", section: 3, feature: "vendorbulk.rows", kind: "bulk", tier: "safe",
      title: "Deals In with ANOTHER workspace's category code is refused", type: "Security", priority: "P2", severity: "Medium",
      why: "Coverage audit GAP-13: the code must be one of this workspace's categories (val:172-179); a code copied from another client must not pass.",
      steps: ["Tripwired row whose Deals In is a category code of the other test client (read from its own run)"],
      sheet: one(trip("VBU-205", { "Deals In": "{{foreignCategoryUuid}}" })), rows: [{ status: "failed", errorIncludes: MSG.DEALS }],
      expected: "Row failed 'Invalid Deals In : <that code>'.", oracle: "Job row error.", rule: `${R.prVal}:157-159,172-179`,
    },
    {
      id: "VBU-206", section: 6, feature: "vendorbulk.data", kind: "bulk", tier: "safe", requires: { contactless: true },
      title: "Contactless: the PAN is derived from the GSTIN (characters 3–12)", type: "Functional", priority: "P1", severity: "Medium",
      why: "Coverage audit GAP-18: under contactless (or vendor_invitation_v2) the PAN is filled in from the GSTIN (val:99-118).",
      steps: ["Tripwired row with GST {{gst}}, Business Location India, PAN No. blank", "Read the staged row's data"],
      sheet: one(trip("VBU-206", { "Tax Type": "GST", "Tax No.": "{{gst}}", "Business Location": "India" })),
      rows: [{ status: "failed", error: MSG.STATUS, dataEquals: { pan_no: "{{pan}}" } }],
      expected: "Row stops at the tripwire with data.pan_no = {{pan}}.", oracle: "Job row data.", rule: `${R.prVal}:99-118`,
    },
    {
      id: "VBU-207", section: 6, feature: "vendorbulk.data", kind: "bulk", tier: "safe", requires: pd,
      title: "Contactless OFF: no PAN is derived from the GSTIN", type: "Functional", priority: "P2", severity: "Low",
      why: "Coverage audit GAP-18, the other side: on a normal workspace the PAN is not derived.",
      steps: ["Tripwired row with GST {{gst}}, Business Location India", "Read the staged row's data"],
      sheet: one(trip("VBU-207", { "Tax Type": "GST", "Tax No.": "{{gst}}", "Business Location": "India", ...PD_REQUIRED })),
      rows: [{ status: "failed", error: MSG.STATUS, dataExcludes: { pan_no: "QATZQ" } }],
      expected: "Row stops at the tripwire with no derived pan_no.", oracle: "Job row data.", rule: `${R.prVal}:99-104`,
    },
    {
      id: "VBU-208", section: 6, feature: "vendorbulk.data", kind: "bulk", tier: "safe",
      title: "A Vendor Code with a dot and trailing zeros keeps its zeros ('QA….100')", type: "Edge", priority: "P1", severity: "High",
      why: "Coverage audit GAP-25: the same zero-stripper as BUG-09, on the vendor code — 'X.100' and 'X.1000' both become 'X.1' and collide as duplicates.",
      steps: ["Tripwired row with Vendor Code 'QA<stamp>.100'"],
      sheet: one(trip("VBU-208", { "Vendor Code": `QA${S}.100` })), rows: [{ status: "failed", error: MSG.STATUS, dataEquals: { "Vendor Code": `QA${S}.100` } }],
      expected: "Staged Vendor Code unchanged.", oracle: "Job row data.", rule: `${R.parse}:176; ${R.utils}:641-647`,
    },
    {
      id: "VBU-209", section: 6, feature: "vendorbulk.data", kind: "bulk", tier: "safe",
      title: "Entity-encoded markup ('&lt;script&gt;') is not decoded into a live tag", type: "Security", priority: "P1", severity: "High",
      why: "Coverage audit GAP-26: every cell goes through Nokogiri .text, which DECODES '&lt;script&gt;' into '<script>'. VBU-163 covers a plain tag; this is the encoded one.",
      steps: ["Tripwired row whose Company Name starts with '&lt;script&gt;alert(1)&lt;/script&gt;'"],
      sheet: one(trip("VBU-209", { "Company Name": `&lt;script&gt;alert(1)&lt;/script&gt;QA_Platform_VBU_${S}_209` })),
      rows: [{ status: "failed", error: MSG.STATUS, dataExcludes: { "Company Name": "<script" } }],
      expected: "The staged name never contains a live '<script'.", oracle: "Job row data.", rule: `${R.parse}:177`,
    },
    {
      id: "VBU-210", section: 4, feature: "vendorbulk.onboarding", kind: "bulk", tier: "creates",
      title: "POC 2 email without a name is refused BEFORE the vendor is created", type: "Negative", priority: "P2", severity: "High",
      why: "Coverage audit GAP-28, the mirror of BUG-07 (name without email). The POC 2 pair is checked after the vendor and its invite exist. No POC 2 invitation is made on this branch, so no mail.",
      steps: ["Row with POC 2 - Email Address filled, POC 2 - Full Name blank", "POST", "Read the row and the vendor"],
      sheet: one({ ...baseRow("VBU-210"), "POC 2 - Email Address": vEmail("VBU-210", 2) }),
      rows: [{ status: "failed", error: MSG.POC2, verify: { absent: true } }],
      expected: "Row failed 'Invalid Values for POC 2.' and NO vendor created.", oracle: "Job row + companies lookup.", rule: `${R.wrk}:175-179`,
    },
    {
      id: "VBU-211", section: 5, feature: "vendorbulk.dedup", kind: "bulk", tier: "creates", anyOrder: true,
      title: "Two new rows in one sheet with the same Vendor Code — only one is created", type: "Negative", priority: "P1", severity: "High",
      why: "Coverage audit GAP-24: the same per-row parallel workers as BUG-01, on the Vendor Code.",
      steps: ["Two rows, same new Vendor Code QADUP<stamp>, different names and emails", "POST", "Read both rows"],
      sheet: { rows: [{ ...baseRow("VBU-211"), "Vendor Code": `QADUP${S}` }, { ...baseRow("VBU-211", 2), "Vendor Code": `QADUP${S}` }] },
      rows: [{ status: "success" }, { status: "failed", error: MSG.CODE_TAKEN }],
      expected: "One row success, the other failed 'Vendor Code or GST Number is already taken'. Two successes = race defect.",
      oracle: "Job rows.", rule: `app/workers/vendor_bulk_upload_master_worker_v2.rb:11-14; ${R.prSend}:261-264`,
    },
    {
      id: "VBU-212", section: 5, feature: "vendorbulk.dedup", kind: "bulk", tier: "creates", baseline: "dedup", requires: dupReq,
      title: "A Vendor Code that differs only in letter case is still a duplicate", type: "Negative", priority: "P2", severity: "Medium",
      why: "Coverage audit GAP-23: the code is matched exactly (where(vendor_code:)), so 'qavc…' slips past 'QAVC…'.",
      steps: ["Row with Vendor Code = the baseline's code in lower case, no tax number"],
      sheet: one({ ...baseRow("VBU-212"), "Vendor Code": `qavc${S}` }), rows: [{ status: "failed", error: MSG.CODE_TAKEN, verify: { absent: true } }],
      expected: "Row failed 'Vendor Code or GST Number is already taken'.", oracle: "Job row + companies lookup.", rule: `${R.prSend}:263-264`,
    },
    {
      id: "VBU-213", section: 5, feature: "vendorbulk.dedup", kind: "bulk", tier: "creates", baseline: "noPincode", requires: dupReq,
      title: "An existing vendor with NO pincode blocks a new branch that has one", type: "Functional", priority: "P1", severity: "Medium",
      why: "Coverage audit GAP-36: a blank pincode counts as a match (the PR's treat_as_match), so a pincode can never separate branches of the legacy vendors, which carry none.",
      steps: ["Baseline vendor without pincode", "Same tax number, address and account group, a new name and email, Pincode 110001"],
      sheet: one({ ...noPincodeBaselineRow(), "Company Name": vName("VBU-213"), "POC - Email Address": vEmail("VBU-213"), Pincode: "110001" }),
      rows: [{ status: "failed", error: MSG.DUP_ADDR }],
      expected: "Row failed 'Vendor with this GST and address already exists' (the PR's design: blank pincode = match).",
      oracle: "Job row.", rule: `${R.prDup}:27,111-119`,
      disagree: "QA doc B2 says a different pincode makes a new branch; against a vendor with no pincode it never does.",
    },
    {
      id: "VBU-214", section: 5, feature: "vendorbulk.dedup", kind: "bulk", tier: "creates", baseline: "backfill", requires: { ...dupReq, contactless: true },
      title: "A back-filled address with a DIFFERENT pincode makes a new branch", type: "Functional", priority: "P1", severity: "Medium",
      why: "Coverage audit GAP-37: a blank Address is filled in from the vendor with the same tax number; the pincode must still tell the branches apart (PR spec duplicate_check_integration_spec.rb:74).",
      steps: ["Baseline vendor with pincode 560007", "Row with the same tax number, Address blank, City Mumbai, Pincode 110007"],
      sheet: one({ "Company Name": vName("VBU-214"), "POC - Full Name": "QA Platform Tester", "POC - Email Address": vEmail("VBU-214"), "Vendor Profile": "{{profile}}",
        "Tax Type": "VAT", "Tax No.": "{{vatL}}", "Business Location": "United Kingdom", City: "Mumbai", Pincode: "110007", "Account Group": "ZCOV", "Vendor Onboarding Required": "No" }),
      rows: [{ status: "success" }],
      expected: "Row success: a second vendor (another branch). Note: the back-fill also replaces the company name typed in the sheet with the existing vendor's name (send:41-51), so the new branch is not findable under the name the buyer gave it.",
      oracle: "Job row.", rule: `${R.prSend}:41-54; ${R.prDup}:27`,
    },
    {
      id: "VBU-215", section: 5, feature: "vendorbulk.dedup", kind: "bulk", tier: "creates", baseline: "rejectedDup", requires: dupReq,
      title: "A Rejected vendor still blocks an exact duplicate", type: "Negative", priority: "P2", severity: "Medium",
      why: "Coverage audit GAP-38: rejected vendors are part of the duplicate search (send:227,259,275).",
      steps: ["Baseline vendor with Status rejected", "Exact duplicate (tax number, address, pincode, account group), new name and email"],
      sheet: one({ ...rejectedDupBaselineRow(), Status: "", "Company Name": vName("VBU-215"), "POC - Email Address": vEmail("VBU-215") }),
      rows: [{ status: "failed", error: MSG.DUP_ADDR }],
      expected: "Row failed 'Vendor with this GST and address already exists'.", oracle: "Job row.", rule: `${R.prSend}:227,259,275`,
    },
    {
      id: "VBU-216", section: 5, feature: "vendorbulk.dedup", kind: "bulk", tier: "creates", baseline: "vrp", requires: { canSkip: true },
      title: "A VRP Code that another vendor already has is refused", type: "Negative", priority: "P1", severity: "Medium",
      why: "Coverage audit GAP-20: the VRP Code is a unique key like the Vendor Code.",
      steps: ["Baseline vendor with VRP Code QAVRP<stamp>", "New row with the same VRP Code"],
      sheet: one({ ...baseRow("VBU-216"), "VRP Code": `QAVRP${S}` }), rows: [{ status: "failed", error: MSG.CODE_TAKEN, verify: { absent: true } }],
      expected: "Row failed 'Vendor Code or GST Number is already taken'.", oracle: "Job row + companies lookup.", rule: `${R.prSend}:266-267,272,280-281`,
    },
    {
      id: "VBU-217", section: 5, feature: "vendorbulk.dedup", kind: "bulk", tier: "creates", baseline: ["dedup", "vrp"], requires: dupReq,
      title: "Vendor Code of one vendor + VRP Code of another is refused", type: "Negative", priority: "P2", severity: "Medium",
      why: "Coverage audit GAP-21.", steps: ["Both baselines exist", "Row with the dedup baseline's Vendor Code and the VRP baseline's VRP Code"],
      sheet: one({ ...baseRow("VBU-217"), "Vendor Code": `QAVC${S}`, "VRP Code": `QAVRP${S}` }),
      rows: [{ status: "failed", error: "Vendor code and VRP Code belong to different companies", verify: { absent: true } }],
      expected: "Row failed 'Vendor code and VRP Code belong to different companies'.", oracle: "Job row.", rule: `${R.prSend}:269-271`,
    },
    {
      id: "VBU-218", section: 5, feature: "vendorbulk.dedup", kind: "bulk", tier: "creates", baseline: ["dedup", "vrp"], requires: dupReq,
      title: "Tax number of one vendor + Vendor Code of another is refused", type: "Negative", priority: "P1", severity: "Medium",
      why: "Coverage audit GAP-22.", steps: ["Both baselines exist", "Row with the dedup baseline's tax number and address and the VRP baseline's Vendor Code"],
      sheet: one({ ...baseRow("VBU-218"), "Tax Type": "VAT", "Tax No.": "{{vatB}}", "Business Location": "United Kingdom", Address: "QA Dedup Road 12", "Vendor Code": `QAVCR${S}` }),
      rows: [{ status: "failed", error: "Code and GST Number belong to different companies", verify: { absent: true } }],
      expected: "Row failed 'Code and GST Number belong to different companies'.", oracle: "Job row.", rule: `${R.prSend}:274-279`,
    },
    {
      id: "VBU-219", section: 4, feature: "vendorbulk.onboarding", kind: "bulk", tier: "creates", requires: { canSkip: true },
      title: "Deals In with a valid category code puts the vendor in that category's team", type: "Functional", priority: "P2", severity: "Medium",
      why: "Coverage audit GAP-12: the category link itself (a teams row on the vendor) had no check.",
      steps: ["Row with Deals In = one of the workspace's category codes", "POST", "Read the vendor's teams"],
      sheet: one({ ...baseRow("VBU-219"), "Deals In": "{{categoryUuid}}" }), rows: [{ status: "success", verify: { bscm: "active", teams: 1 } }],
      expected: "Row success; the vendor is in one category team.", oracle: "teams rows (SELECT).", rule: `app/controllers/concerns/teams_create_concern.rb:23-48`,
    },
    {
      id: "VBU-220", section: 4, feature: "vendorbulk.onboarding", kind: "bulk", tier: "creates", requires: { canSkip: true },
      title: "Deals In by category NAME is either refused or linked — never accepted and dropped", type: "Negative", priority: "P1", severity: "Medium",
      why: "Coverage audit GAP-11: a unique category name passes validation, but the worker decodes it as a code (nil), so no team is made — the category silently disappears.",
      steps: ["Row with Deals In = a category NAME", "POST", "Read the vendor's teams"],
      sheet: one({ ...baseRow("VBU-220"), "Deals In": "{{categoryName}}" }), rows: [{ status: "success", verify: { bscm: "active", teams: 1 } }],
      expected: "Row success and the vendor is in that category's team (or the row is refused). Per the code: success and NO team.",
      oracle: "teams rows (SELECT).", rule: `${R.prVal}:176-179; ${R.prUtils}:898-900; app/controllers/concerns/teams_create_concern.rb:33-40`,
    },
    {
      id: "VBU-221", section: 4, feature: "vendorbulk.onboarding", kind: "bulk", tier: "creates", requires: { contactless: true, canSkip: true },
      title: "Status 'active' with Onboarding Required = Yes still makes a Prospect", type: "Functional", priority: "P2", severity: "Low",
      why: "Coverage audit GAP-15: the worker drops Status unless it is 'rejected' (wrk:97), so 'active' changes nothing. No contact, so no invitation and no mail.",
      steps: ["Contactless row: only Company Name, Status active, Vendor Onboarding Required Yes"],
      sheet: one({ "Company Name": vName("VBU-221"), Status: "active", "Vendor Onboarding Required": "Yes" }),
      rows: [{ status: "success", verify: { bscm: "invited", invitations: 0 } }],
      expected: "Row success; the vendor is a Prospect (invited), 0 invitations.", oracle: "Mapping + invitations.", rule: `${R.wrk}:97; ${R.prSend}:400-407`,
    },
    {
      id: "VBU-254", section: 2, feature: "vendorbulk.access", kind: "bulk", tier: "creates", requires: { canSkip: true }, anyOrder: true,
      title: "The upload history counts a mixed upload correctly (Completed 1 · Failed 1)", type: "Functional", priority: "P1", severity: "Medium",
      why: "Coverage audit S-039: the counters a buyer reads in the Bulk Upload history (ctrl:251-268) were never asserted.",
      steps: ["One valid row (onboarding No) and one tripwired row in one sheet", "POST", "Read GET /v1/bulk_create_vendor_status for the job"],
      sheet: { rows: [baseRow("VBU-254"), trip("VBU-254", {}, 2)] },
      rows: [{ status: "success" }, { status: "failed", error: MSG.STATUS }],
      statusCounts: { total: 2, success: 1, failed: 1, already_mapped: 0 },
      expected: "History line for the job: Total 2 · Completed 1 · Failed 1 · Duplicate 0.", oracle: "Status API counters.", rule: `${R.ctrl}:251-268`,
    },
    // ── file, template, error sheet, access ──
    {
      id: "VBU-222", section: 1, feature: "vendorbulk.file", kind: "bulk", tier: "safe",
      title: "A workbook whose FIRST sheet is an instructions sheet: the vendor sheet is still read", type: "Edge", priority: "P2", severity: "Low",
      why: "Coverage audit GAP-47: only the first worksheet is read (parse:164-173); a buyer who adds an instructions tab in front gets HTTP 200 and nothing staged.",
      steps: ["Sheet 1 'Instructions' with one line; sheet 2 the vendor sheet with one tripwired row"],
      sheet: { layout: "grid", grid: [["Instructions: fill in the next sheet"]], extraSheets: { "Vendors": [
        ["Mandatory Details"], [""],
        ["Company Name", "City", "Address", "Vendor Profile", "POC - Full Name", "POC - Email Address", "Status", "Vendor Onboarding Required"],
        [vName("VBU-222"), "Mumbai", "QA Test Street 1", "{{profile}}", "QA Platform Tester", vEmail("VBU-222"), TRIP_STATUS, "No"],
      ] } },
      rows: tripped(),
      expected: "The vendor sheet is read (row failed 'Invalid Status'), or the file is refused with a message. Per the code: HTTP 200 and nothing staged.",
      oracle: "Job rows.", rule: `${R.parse}:164-173`,
    },
    {
      id: "VBU-223", section: 2, feature: "vendorbulk.access", kind: "templateUpload", tier: "safe", requires: { contactless: true },
      title: "The template uploaded as downloaded gives a sensible row error", type: "Functional", priority: "P2", severity: "Low",
      why: "Coverage audit GAP-48. A buyer who uploads the template untouched sends its sample row. The runner sets that row's Status to the tripwire first, so even a corrected template (whose sample contact is a real procol.in address) creates nothing.",
      steps: ["Download the template", "Set the sample row's Status to QA_TRIPWIRE", "Upload it"],
      rows: tripped(),
      expected: "The sample row lines up with its columns, so it reaches the Status check ('Invalid Status'). Today: 'Tax Type not configured…' because the row is shifted (BUG-12).",
      oracle: "Job row error.", rule: `${R.prTpl}:295-337; ${R.prVal}:24-25,86-95`,
    },
    {
      id: "VBU-224", section: 2, feature: "vendorbulk.access", kind: "http", tier: "safe", method: "GET", path: "/v1/bulk_create_vendor_error_sheet?job_uuid=QA_NOT_A_UUID",
      title: "Error sheet for a job id that does not decode is refused 'Insufficient parameters'", type: "Negative", priority: "P3", severity: "Low",
      why: "Coverage audit GAP-50.", steps: ["GET /v1/bulk_create_vendor_error_sheet?job_uuid=QA_NOT_A_UUID"], httpExpected: "reject", httpMessage: MSG.INSUFFICIENT,
      expected: "HTTP 422 'Insufficient parameters' (not 487, not 500).", oracle: "HTTP status + message.", rule: `app/controllers/concerns/params_auth.rb:74-75; ${R.ctrl}:235`,
    },
    {
      id: "VBU-225", section: 2, feature: "vendorbulk.access", kind: "http", tier: "safe", actor: "member-no-company-create", method: "GET",
      path: "/v1/bulk_create_vendor_status?as=member-without-company-create",
      title: "A user who may not upload cannot read the upload status list", type: "Security", priority: "P2", severity: "Low",
      why: "Coverage audit GAP-51: status, error sheet and onboarding payload are authorised like the upload (pol:128-134).",
      steps: ["As a QA user without company:create_record: GET /v1/bulk_create_vendor_status"], httpExpected: "reject", httpMessage: "You are not authorized to perform this action",
      expected: "HTTP 422 'You are not authorized to perform this action'.", oracle: "HTTP status + message.", rule: `${R.pol}:128-134; ${R.ctrl}:204`,
    },
    {
      id: "VBU-226", section: 2, feature: "vendorbulk.access", kind: "http", tier: "safe", actor: "member-no-company-create", method: "GET",
      path: "/v1/bulk_create_vendor_error_sheet?job_uuid=QA_NOT_A_UUID&as=member-without-company-create",
      title: "A user who may not upload cannot download error sheets", type: "Security", priority: "P2", severity: "Low",
      why: "Coverage audit GAP-51.", steps: ["As a QA user without company:create_record: GET the error sheet"], httpExpected: "reject", httpMessage: "You are not authorized to perform this action",
      expected: "HTTP 422 'You are not authorized to perform this action' (checked before the job id).", oracle: "HTTP status + message.", rule: `${R.pol}:128-134; ${R.ctrl}:233`,
    },
    {
      id: "VBU-227", section: 1, feature: "vendorbulk.file", kind: "bulk", tier: "safe",
      title: "An old-format 'GST ' column (trailing space) is caught like 'GST'", type: "Edge", priority: "P3", severity: "Low",
      why: "Coverage audit GAP-53: the old-format check compares the raw header (parse:164), so 'GST ' slips past it.",
      steps: ["Tripwired row in a sheet that also has a 'GST ' column"],
      sheet: { headers: ["Company Name", "Vendor Profile", "POC - Full Name", "POC - Email Address", "City", "Address", "Status", "Vendor Onboarding Required", "GST "], rows: [{ ...trip("VBU-227", {}), "GST ": "{{gst}}" }] },
      refuse: { message: MSG.OLD_FORMAT },
      expected: "HTTP 422 'Format is updated for bulk upload, please download the format to continue.'", oracle: "HTTP status + message.", rule: `${R.parse}:164-165`,
    },
    {
      id: "VBU-228", section: 6, feature: "vendorbulk.data", kind: "bulk", tier: "safe",
      title: "A city typed in capitals ('MUMBAI') resolves to Mumbai", type: "Functional", priority: "P3", severity: "Low",
      why: "Coverage audit GAP-55.", steps: ["Tripwired row with City 'MUMBAI'", "Read the staged row's city_id"],
      sheet: one(trip("VBU-228", { City: "MUMBAI" })), rows: [{ status: "failed", error: MSG.STATUS, dataEquals: { city_id: "8" } }],
      expected: "Staged city_id = 8 (Mumbai).", oracle: "Job row data.", rule: `${R.prVal}:122-131`,
    },
    {
      id: "VBU-229", section: 5, feature: "vendorbulk.dedup", kind: "bulk", tier: "safe",
      title: "A lower-case VAT number cannot slip past the duplicate check (it is refused)", type: "Edge", priority: "P3", severity: "Low",
      why: "Coverage audit GAP-56: the duplicate search matches gst_no exactly, so 'gb…' stored next to 'GB…' would be two vendors. The VAT pattern is upper-case only, so the row is refused before that can happen.",
      steps: ["Tripwired row with Tax No. = {{vatB}} in lower case"],
      sheet: one(trip("VBU-229", { "Tax Type": "VAT", "Tax No.": "{{vatBLower}}", "Business Location": "United Kingdom" })),
      rows: fails(MSG.TAXINV),
      expected: "Row failed 'Invalid Tax No.' (the pattern is upper-case only), so no lower-case duplicate can be stored.", oracle: "Job row error.", rule: `${R.prVal}:92-95; ${R.prSend}:275`,
    },
    {
      id: "VBU-230", section: 4, feature: "vendorbulk.onboarding", kind: "bulk", tier: "creates",
      title: "POC 2 email equal to the main POC email is refused before the vendor is created", type: "Negative", priority: "P2", severity: "Medium",
      why: "Coverage audit GAP-27. The member invite for the same address is refused 'already invited' (688) — after the vendor and its invite exist. No VRP Code in the row: with one, the code sends a second invitation instead (778), which would mail the vendor-management team.",
      steps: ["Row whose POC 2 - Email Address is the same as POC - Email Address", "POST", "Read the row and the vendor"],
      sheet: one({ ...baseRow("VBU-230"), "POC 2 - Full Name": "QA Second Contact", "POC 2 - Email Address": vEmail("VBU-230") }),
      rows: [{ status: "failed", verify: { absent: true } }],
      expected: "Row failed (POC 2 must be a different person) and NO vendor created. Per the code: failed 'This email is already invited.' but the vendor exists.",
      oracle: "Job row + companies lookup.", rule: `${R.wrk}:37-58,175-182; ${R.prSend}:237,241-253`,
    },
    {
      id: "VBU-231", section: 2, feature: "vendorbulk.access", kind: "errorSheet", tier: "safe", errorSheetCheck: "profileDropdown",
      title: "The error sheet's Vendor Profile dropdown sits on the Vendor Profile column", type: "Functional", priority: "P2", severity: "Low",
      why: "Coverage audit GAP-49: the error sheet hard-codes the profile list on F4:F100 (tpl:97), but the column is E on PROCOL DEMO and H on GMMCO.",
      steps: ["Upload a tripwired row", "Download its error sheet", "Compare the profile dropdown's range with the Vendor Profile column"],
      sheet: one(trip("VBU-231", {})), rows: tripped(),
      expected: "The 'Invalid Vendor Profile' dropdown covers the Vendor Profile column.", oracle: "Error sheet data validations.", rule: `${R.tpl}:97`,
    },

    // ── listed, not run: they mail real people, change GMMCO for good, or call out ──
    approval("VBU-232", "A contactless 'rejected' row with no contact creates a user with no email — and blocks every later no-email row",
      "Coverage audit GAP-02. create_user_for_rejected_vendor looks the email up as NULL, finds nothing and creates a user whose email is NULL; afterwards send:233 matches that user for every no-email row ('This email is already invited.'). GMMCO's 11,000-row legacy load is exactly this row type.",
      ["Row: Company Name, Status rejected, Vendor Onboarding Required No (no contact)", "Second upload: a no-contact row"],
      "No blank user is created and the second row succeeds. Per the code: a NULL-email user, then 'This email is already invited.' on every later no-email row.",
      `${R.wrk}:28-35,159-161; ${R.prMixin}:14-15; ${R.prSend}:233-253`,
      "Leaves a lasting change on the workspace (a user with no email that breaks later uploads). Run only with the workspace owner's approval; a read-only probe on 5 Oct 2026 found no such user from our runs.",
      { severity: "Critical", priority: "P0", tier: "creates" }),
    approval("VBU-233", "A Status=rejected row that becomes a subsidiary is not rejected",
      "Coverage audit GAP-03: the subsidiary path ignores Status, so the mapping is active and the subsidiary is invited (mail).",
      ["Subsidiary baseline (VBU-131's)", "Row reusing its contact email, Status rejected, a new UK VAT number"],
      "Mapping rejected, no mail. Per the code: active or invited, and the invite and prospect mails go out.", `${R.prSend}:85-87; ${R.sub}:199-235`,
      "Sends the invite and 'new prospect' mails to the vendor-management team (real people). Needs approval (run with --real-mail)."),
    approval("VBU-234", "A rejected vendor with POC 2 still sends POC 2 an active invitation",
      "Coverage audit GAP-04: the member invite ignores the rejected status and carries no skip flag.",
      ["Row with Status rejected and POC 2 name + email"],
      "No POC 2 invitation for a rejected vendor. Per the code: an active vendor_member_invite and the prospect mail.", `${R.wrk}:175-182; ${R.prSend}:374-381,393-398`,
      "Mails the vendor-management team (and POC 2). Needs approval."),
    approval("VBU-235", "A blank City/Address copies ANOTHER workspace's vendor details in",
      "Coverage audit GAP-05: the tax-number back-fill searches every workspace (Company.active.find_by(gst_no:)), so another client's vendor name, address and city are merged in.",
      ["On PROCOL DEMO: a vendor with UK VAT {{vatN}} and 'QA PD Leak Road 1'", "On GMMCO: a no-contact row with only that VAT number"],
      "No data from another workspace. Per the code: the GMMCO vendor is named and addressed after the PROCOL DEMO one.", `${R.helper}:732-747; ${R.prSend}:41-54`,
      "Needs a run across two workspaces in sequence, which the runner does not do yet. Test vendors only, no real mail — safe to build next.",
      { tier: "creates", severity: "Critical", priority: "P0", type: "Security" }),
    approval("VBU-236", "A new tax number with no Address triggers a live GST/VAT provider lookup",
      "Coverage audit GAP-06: the back-fill calls the external tax-number provider when no vendor in Procol has the number.",
      ["GMMCO row: GST {{gst}}, Business Location India, City Mumbai, Address blank, onboarding No"],
      "Decided without a third-party call, or refused clearly. Per the code: an external lookup; the message depends on the provider.", `${R.prSend}:42-52; ${R.helper}:748-767`,
      "Sends the tax number to an external provider. Needs approval.", { tier: "safe" }),
    approval("VBU-237", "Same contact + Vendor Code (no tax) makes a subsidiary that inherits the original's tax number",
      "Coverage audit GAP-31: the subsidiary copies the parent (vendor.dup) and a nil gst_no is dropped by .compact, so a second company carries the same tax number without the duplicate check ever seeing it.",
      ["Subsidiary baseline", "Row reusing its contact email with a Vendor Code and no tax number"],
      "Refused or created without the parent's tax number. Per the code: a subsidiary with gst_no = the parent's.", `${R.sub}:164-212; ${R.prMixin}:30,39`,
      "The subsidiary invitation mails the vendor-management team (CODE-2). Needs approval."),
    approval("VBU-238", "Onboarding payload + Status rejected + Yes starts onboarding for a rejected vendor",
      "Coverage audit GAP-35.", ["VBU-134's payload; row with Status rejected, Vendor Onboarding Required Yes"],
      "No onboarding event for a rejected vendor. Per the code: mapping rejected AND an onboarding event.", `${R.wrk}:93,195`,
      "Starts an onboarding event (mails). Needs approval."),
    approval("VBU-239", "A contact who is already a vendor user elsewhere is silently auto-joined",
      "Coverage audit GAP-30: the invitation is created as accepted and the existing user gets a mapping to the new vendor without being asked.",
      ["On PROCOL DEMO: a rejected row creates a vendor user qa_vbu_<stamp>_reg@example.com", "On GMMCO: a row with that email"],
      "Product decision: ask the user, or auto-join. Per the code: invitation accepted, user mapped.", `${R.prSend}:69,100-108,329,341-343`,
      "Needs a run across two workspaces in sequence. Test vendors only.", { tier: "creates" }),
    approval("VBU-240", "A POC email that belongs to a buyer user is refused",
      "Coverage audit GAP-29.", ["Row with Status rejected and the POC email of a buyer user"], "Row failed 'This email is already registered.'",
      `${R.prSend}:147-167`, "Needs a buyer user that is one of OUR QA test accounts; the GMMCO admin is a real person's account, so it is never used as data.", { tier: "safe" }),
    approval("VBU-241", "A registered contact's subsidiary with no City/Address is refused 'Incorrect details'",
      "Coverage audit GAP-32.", ["VBU-125's vendor user exists", "Row reusing its email with a Vendor Code, no City/Address"],
      "Row failed 'Incorrect details'.", `${R.sub}:88-96,149-160`, "Depends on another case's vendor user within the same run; not wired yet.", { tier: "safe" }),
    approval("VBU-242", "An onboarding payload with a broken form gives a 'success' row and no event",
      "Coverage audit GAP-34.", ["VBU-132's payload with a non-existent form id; a no-contact 'Yes' row"],
      "Row failed (onboarding could not start). Per the code: success, Prospect, no event (only logged).", `app/workers/vendor_onboarding_event_worker.rb:36-38`,
      "Needs a deliberately broken onboarding payload builder; not wired yet.", { tier: "creates" }),
    approval("VBU-243", "A profile that maps to broker/brokerage takes the broker invite",
      "Coverage audit GAP-16.", ["Row whose Vendor Profile maps to broker"], "Company category brokerage; invite type broker_invite.",
      `${R.wrk}:115-125; ${R.prMixin}:80-93`, "Neither test client maps a profile to broker.", { tier: "creates" }),
    approval("VBU-244", "Another user's job id is not exposed through the error sheet",
      "Coverage audit GAP-52.", ["As user B, GET the error sheet of user A's job"], "HTTP 422 487 (no job for this user).",
      `${R.ctrl}:236-238`, "Needs a second QA user who uploads; none exists yet.", { tier: "safe", type: "Security" }),
    approval("VBU-245", "Read-only: a contactless blank profile stores the first 'manufacturer' mapping",
      "Coverage audit GAP-17.", ["SELECT misc->'category_data' of VBU-121's vendor"], "The first vendor_category_type_mapping entry whose category is manufacturer.",
      `${R.wrk}:116-130`, "A database read of another case's vendor; not wired as its own check yet.", { tier: "safe" }),
    approval("VBU-246", "Read-only: an Active vendor raises the P2P vendor-portal request (GMMCO)",
      "Coverage audit GAP-33.", ["SELECT external_requests p2p_boiler_plate_upsert for VBU-121's vendor"], "One request per Active vendor (none for a Prospect).",
      `${R.bscm}:48,185-215`, "A database read of another case's vendor; not wired as its own check yet.", { tier: "safe" }),
    ...[
      ["VBU-247", "Duplicate fields = [gst_no] only falls back to the old rule", "GAP-39", "dup:67-74"],
      ["VBU-248", "pan_no in the duplicate key: a different PAN makes a new vendor", "GAP-40", "dup:25"],
      ["VBU-249", "can_skip OFF: Vendor Onboarding Required is not validated and 'No' still makes a Prospect", "GAP-42", "val:211; wrk:93"],
      ["VBU-250", "vendor_invitation_v2 ON (contactless OFF): Profile/City/Address optional, POC email still mandatory", "GAP-43", "val; tpl:99-101; sub:116-128"],
      ["VBU-251", "No onboarding version: a matching row is 'already_mapped' and the vendor updated", "GAP-44", "wrk:131-140; update_mapped_vendor_service.rb:12-70"],
      ["VBU-252", "disable_manual_vendor_creation ON, as a Procol employee: upload allowed", "GAP-45", "ctrl:206"],
      ["VBU-253", "restricted_pan_email_domains: a PAN on the wrong email domain is refused", "GAP-46", "pan_email_domain_service.rb:28-41"],
    ].map(([id, title, gap, rule]) => approval(id, title, `Coverage audit ${gap}.`, ["See the coverage audit"], "As the audit's expected outcome.", rule,
      "Needs a workspace with this setting; neither test client has it (the settings are the owner's to change).", { tier: "safe", feature: "vendorbulk.settings" })),
  ];
}
