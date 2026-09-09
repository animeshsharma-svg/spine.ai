/**
 * FIELD-AWARE EDGE CASES — the senior-QA brain.
 *
 * Different field types deserve different attacks. Given a field's spec, this
 * produces the edge/negative/boundary/security inputs a thorough QA engineer
 * would try, each with the outcome the PRODUCT *should* give (accept/reject).
 * The engine then fires each as a real request and compares.
 */
export type FieldType = "text" | "number" | "email" | "phone" | "enum";

/** Sentinel: drop the field entirely (tests "mandatory field omitted"). */
export const OMIT = Symbol("omit");

export interface FieldSpec {
  name: string;
  type: FieldType;
  label: string;
  required?: boolean;
  maxLength?: number;
  minValue?: number; // smallest VALID number (e.g. 1 for quantity)
  enumValues?: string[];
}

export interface Variant {
  label: string; // scenario, e.g. "empty value"
  value: any; // or OMIT
  expected: "accept" | "reject";
  category: string; // "Data Validation" | "Boundary" | "Edge" | "Security" | "Negative"
  severity: "Critical" | "High" | "Medium" | "Low";
  rationale: string; // why a senior QA tests this
}

const rid = () => Math.floor(Math.random() * 1e6);
const digits = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");

/** All the edge cases for one field. */
export function variantsFor(f: FieldSpec): Variant[] {
  const v: Variant[] = [];
  const L = f.label;

  if (f.required) {
    v.push({ label: "field omitted", value: OMIT, expected: "reject", category: "Data Validation", severity: "High", rationale: "A mandatory field must be enforced server-side, not only in the UI." });
    if (f.type !== "number")
      v.push({ label: "empty value", value: "", expected: "reject", category: "Data Validation", severity: "High", rationale: "An empty required value must be rejected." });
    if (f.type === "text")
      v.push({ label: "whitespace only", value: "   ", expected: "reject", category: "Edge", severity: "Medium", rationale: "Whitespace should trim to empty and then be rejected." });
  }

  switch (f.type) {
    case "text": {
      if (f.maxLength) {
        v.push({ label: `exactly max length (${f.maxLength})`, value: "A".repeat(f.maxLength), expected: "accept", category: "Boundary", severity: "Low", rationale: "The boundary value should be accepted." });
        v.push({ label: `over max length (${f.maxLength + 1})`, value: "A".repeat(f.maxLength + 1), expected: "reject", category: "Boundary", severity: "Medium", rationale: "Values over the limit must be rejected, not silently truncated." });
      } else {
        v.push({ label: "very long (2000 chars)", value: "A".repeat(2000), expected: "accept", category: "Boundary", severity: "Low", rationale: "Long input must not crash the server (watch for 5xx or silent truncation)." });
      }
      v.push({ label: "emoji & unicode", value: `QA✅Ω测试${rid()}`, expected: "accept", category: "Edge", severity: "Low", rationale: "Unicode must be stored intact, not corrupted or rejected." });
      v.push({ label: "special characters", value: `<>&"'/\\${rid()}`, expected: "accept", category: "Edge", severity: "Low", rationale: "Special characters must be handled without an error." });
      v.push({ label: "SQL injection", value: `x'); DROP TABLE users;--${rid()}`, expected: "reject", category: "Security", severity: "High", rationale: "A SQLi payload must be rejected or safely sanitized — never executed or 5xx." });
      v.push({ label: "XSS payload", value: `<script>alert('xss')</script>${rid()}`, expected: "reject", category: "Security", severity: "High", rationale: "A script payload must be sanitized or rejected." });
      break;
    }
    case "number": {
      const mustBePositive = (f.minValue ?? 1) > 0;
      v.push({ label: "zero", value: 0, expected: mustBePositive ? "reject" : "accept", category: "Boundary", severity: "Medium", rationale: "Zero is a classic boundary; quantities/prices usually must be greater than zero." });
      v.push({ label: "negative", value: -5, expected: "reject", category: "Data Validation", severity: "High", rationale: "Negative values are almost never valid for a quantity or price." });
      v.push({ label: "non-numeric text", value: "ten", expected: "reject", category: "Data Validation", severity: "High", rationale: "A numeric field must reject non-numeric text." });
      v.push({ label: "decimal", value: 1.5, expected: "accept", category: "Edge", severity: "Low", rationale: "Decimal handling should be defined and consistent." });
      v.push({ label: "very large (1e9)", value: 1_000_000_000, expected: "accept", category: "Boundary", severity: "Low", rationale: "Large values must not overflow or crash." });
      break;
    }
    case "email": {
      v.push({ label: "missing @", value: `invalid.email.${rid()}.com`, expected: "reject", category: "Data Validation", severity: "High", rationale: "A malformed email must be rejected." });
      v.push({ label: "missing domain", value: `user${rid()}@`, expected: "reject", category: "Data Validation", severity: "High", rationale: "An incomplete email must be rejected." });
      v.push({ label: "spaces inside", value: `us er${rid()}@test.com`, expected: "reject", category: "Edge", severity: "Medium", rationale: "Spaces make an email invalid." });
      break;
    }
    case "phone": {
      v.push({ label: "contains letters", value: `${digits(7)}ABC`, expected: "reject", category: "Data Validation", severity: "High", rationale: "A phone must be digits only. (Known gap: the API checks length, not digit-type.)" });
      v.push({ label: "too short (9 digits)", value: digits(9), expected: "reject", category: "Boundary", severity: "Medium", rationale: "Wrong-length numbers must be rejected." });
      v.push({ label: "too long (11 digits)", value: digits(11), expected: "reject", category: "Boundary", severity: "Medium", rationale: "Wrong-length numbers must be rejected." });
      break;
    }
    case "enum": {
      v.push({ label: "invalid option", value: `INVALID_${rid()}`, expected: "reject", category: "Data Validation", severity: "High", rationale: "Values outside the allowed set must be rejected." });
      const first = f.enumValues?.[0];
      if (first) {
        const wrongCase = first === first.toLowerCase() ? first.toUpperCase() : first.toLowerCase();
        v.push({ label: `wrong case ("${wrongCase}")`, value: wrongCase, expected: "reject", category: "Edge", severity: "Low", rationale: "Enum matching is usually case-sensitive." });
      }
      break;
    }
  }
  return v;
}
