/**
 * Shapes of the product model. Everything a person reads is in `plain` /
 * `title`; codes, keys and citations sit beside it for the Details section.
 */

export type RuleKind =
  | "required"
  | "type"
  | "range"
  | "enum"
  | "dependency"
  | "readOnly"
  | "regex"
  | "unit"
  | "precision"
  | "maxLength"
  | "visibility";

/** Who actually stops a bad value: the server, only the screen, or nobody (the template just says so). */
export type Enforcer = "backend" | "screen" | "template-only" | "unknown";

export interface FieldRule {
  kind: RuleKind;
  /** plain English, e.g. "Must be a number with at most 4 decimals" */
  plain: string;
  enforcedBy: Enforcer;
  /** machine-readable value: true for required, {min,max}, string[] for enum, the formula, the regex … */
  value?: unknown;
  code?: number;
  message?: string;
  cites?: string[];
}

export interface ModelField {
  position: number;
  section: "line_item" | "whole_bid" | "form";
  /** form page name, for technical (RFP) templates */
  page?: string;
  key: string;
  name: string;
  inputType: string;
  /** plain name of the input kind: "number", "choice from a list" … */
  kindLabel: string;
  filledBy: "buyer" | "vendor" | "computed" | "nobody";
  required: boolean;
  mode?: string;
  unit?: string;
  currency?: string;
  precision?: number;
  options?: string[];
  /** where options come from when they are not in the template */
  optionsSource?: string;
  formula?: string;
  rules: FieldRule[];
  /** one plain sentence a QA engineer or buyer understands */
  plain: string;
  details: Record<string, unknown>;
}

export type EventUse = "rfq" | "rfp" | "auction" | "forward_auction" | "boq" | "service";

export interface TemplateProblem {
  /** plain English */
  plain: string;
  severity: "blocks" | "warning" | "info";
  code?: number;
  details?: Record<string, unknown>;
}

export interface ModelTemplate {
  uuid: string;
  name: string;
  templateType: string;
  orderType?: string | null;
  typeIdentifiers: string[];
  listedUnder: string[];
  useFor: EventUse[];
  isDefault: boolean;
  opens: boolean;
  /** the plain one-liner shown in a chooser */
  summary: string;
  fieldCount: number;
  requiredCount: number;
  buyerFields: number;
  vendorFields: number;
  computedFields: number;
  quantityUnit?: string;
  fields: ModelField[];
  problems: TemplateProblem[];
  updatedAt?: number;
}

export interface ClientModel {
  companyId: number;
  companyName: string | null;
  fetchedAt: string;
  hash: string;
  previousHash?: string | null;
  changed?: boolean;
  changes?: string[];
  snapshotId?: number | null;
  templates: ModelTemplate[];
  units: {
    usable: Array<{ symbol: string; name: string; owner: "client" | "procol-wide" }>;
    count: number;
    companyOnly: boolean;
    rulePlain: string;
    defaultUnit: unknown;
    allowUserToAddUom: unknown;
    unusableProductUnits: Array<{ symbol: string; unitName: string; ownerCompanyId: number | null; products: number; sample: string[] }>;
    productsWithUnusableUnit: number;
  };
  products: {
    active: number;
    activeQualities: number;
    withUnitLinks: number;
    sample: Array<{ name: string; code: string | null; qualities: number; units: string[]; usable: boolean; why?: string }>;
  };
  locations: { active: number };
  vendors: { invitable: number; byStatus: Record<string, number>; allowedStatuses: string[]; allowedStatusesFrom: string; qaSafe: Array<{ name: string; status: string }> };
  settings: Array<{ key: string; value: unknown; plain: string }>;
  gates: Record<string, { on: boolean | null; reasons: string[] }>;
  findings: Array<{ plain: string; severity: "defect" | "risk" | "info"; details?: Record<string, unknown> }>;
  errors: Array<{ section: string; message: string }>;
  summary: Record<string, unknown>;
}
