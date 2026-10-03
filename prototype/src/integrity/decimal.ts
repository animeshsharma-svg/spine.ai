/**
 * EXACT DECIMALS for the integrity oracle.
 *
 * Money must never be checked with JavaScript floats: 0.1 + 0.2 is
 * 0.30000000000000004, and a calculator that drifts like that cannot tell a
 * real rounding defect from its own noise. Every number here is an integer
 * mantissa (BigInt) and a decimal scale: 12.345 = 12345 × 10^-3.
 *
 * add / sub / mul are exact. div is carried to DIV_SCALE places (30) and then
 * rounded half-up, which is far below any precision the app shows (≤ 6).
 *
 * Rounding: `round(dp, mode)`. The backend's rules (see numbers.md):
 *   - Ruby Float#round(n) and BigDecimal#round(n) round half AWAY from zero
 *     ("half-up" in Ruby's naming) — mode "half_up" here.
 *   - Float#floor / #ceil exist in a few places — modes "floor" / "ceil".
 * Ruby rounds a FLOAT, so 2.675.round(2) can give 2.68 or 2.67 depending on
 * the binary value; the oracle uses the exact decimal, and the tolerance in
 * invariants.ts allows one unit of the last shown place for that reason.
 */

const DIV_SCALE = 30;

export type RoundMode = "half_up" | "half_even" | "floor" | "ceil" | "truncate";

const TEN = 10n;
function pow10(n: number): bigint {
  let r = 1n;
  for (let i = 0; i < n; i++) r *= TEN;
  return r;
}

export class Dec {
  /** value = m × 10^-s */
  private constructor(readonly m: bigint, readonly s: number) {}

  static readonly ZERO = new Dec(0n, 0);
  static readonly ONE = new Dec(1n, 0);

  /**
   * From a number or a numeric string. A number is read through its shortest
   * round-trip string (String(0.1) === "0.1"), so 0.1 is exactly one tenth.
   * Formatted amounts ("₹ 1,23,456.50", "1.2e3") are accepted; anything that
   * is not a number throws.
   */
  static of(v: number | string | bigint | Dec): Dec {
    if (v instanceof Dec) return v;
    if (typeof v === "bigint") return new Dec(v, 0);
    if (typeof v === "number") {
      if (!Number.isFinite(v)) throw new Error(`not a finite number: ${v}`);
      return Dec.parse(String(v));
    }
    return Dec.parse(v);
  }

  /** Like of(), but undefined for anything that is not a number (blank, null, words). */
  static tryOf(v: unknown): Dec | undefined {
    if (v === null || v === undefined || v === "" || typeof v === "boolean") return undefined;
    if (typeof v !== "number" && typeof v !== "string" && typeof v !== "bigint" && !(v instanceof Dec)) return undefined;
    try {
      return Dec.of(v as number | string | bigint | Dec);
    } catch {
      return undefined;
    }
  }

  private static parse(raw: string): Dec {
    let t = raw.trim().replace(/[₹$€£¥,\s]/g, "").replace(/^[A-Za-z]{3}(?=[-\d.])/, "");
    if (!t) throw new Error(`not a number: "${raw}"`);
    let exp = 0;
    const e = t.match(/^(.*)[eE]([+-]?\d+)$/);
    if (e) {
      t = e[1];
      exp = Number(e[2]);
    }
    const m = t.match(/^([+-]?)(\d*)(?:\.(\d*))?$/);
    if (!m || (m[2] === "" && (m[3] ?? "") === "")) throw new Error(`not a number: "${raw}"`);
    const frac = m[3] ?? "";
    let mant = BigInt((m[2] || "0") + frac);
    if (m[1] === "-") mant = -mant;
    let scale = frac.length - exp;
    if (scale < 0) {
      mant *= pow10(-scale);
      scale = 0;
    }
    return new Dec(mant, scale).trim();
  }

  private trim(): Dec {
    let { m, s } = this;
    while (s > 0 && m % TEN === 0n) {
      m /= TEN;
      s--;
    }
    return m === this.m && s === this.s ? this : new Dec(m, s);
  }

  private static align(a: Dec, b: Dec): [bigint, bigint, number] {
    if (a.s === b.s) return [a.m, b.m, a.s];
    if (a.s > b.s) return [a.m, b.m * pow10(a.s - b.s), a.s];
    return [a.m * pow10(b.s - a.s), b.m, b.s];
  }

  add(o: Dec | number | string): Dec {
    const [x, y, s] = Dec.align(this, Dec.of(o));
    return new Dec(x + y, s).trim();
  }
  sub(o: Dec | number | string): Dec {
    const [x, y, s] = Dec.align(this, Dec.of(o));
    return new Dec(x - y, s).trim();
  }
  mul(o: Dec | number | string): Dec {
    const b = Dec.of(o);
    return new Dec(this.m * b.m, this.s + b.s).trim();
  }
  /** Division to 30 places, half-up. Division by zero throws (the caller decides what the app should show). */
  div(o: Dec | number | string): Dec {
    const b = Dec.of(o);
    if (b.m === 0n) throw new RangeError("division by zero");
    // (a.m / 10^a.s) / (b.m / 10^b.s) = a.m × 10^(b.s + K) / b.m × 10^-(a.s + K)
    const K = DIV_SCALE + 1;
    const num = this.m * pow10(b.s + K);
    // truncated to DIV_SCALE + 1 places (one guard digit), then rounded half-up on that digit
    return new Dec(num / b.m, this.s + K).round(DIV_SCALE, "half_up").trim();
  }
  neg(): Dec {
    return new Dec(-this.m, this.s);
  }
  abs(): Dec {
    return this.m < 0n ? this.neg() : this;
  }
  sign(): -1 | 0 | 1 {
    return this.m === 0n ? 0 : this.m < 0n ? -1 : 1;
  }
  isZero(): boolean {
    return this.m === 0n;
  }
  cmp(o: Dec | number | string): -1 | 0 | 1 {
    const [x, y] = Dec.align(this, Dec.of(o));
    return x === y ? 0 : x < y ? -1 : 1;
  }
  eq(o: Dec | number | string): boolean {
    return this.cmp(o) === 0;
  }
  lt(o: Dec | number | string): boolean {
    return this.cmp(o) < 0;
  }
  gt(o: Dec | number | string): boolean {
    return this.cmp(o) > 0;
  }
  static min(...xs: Dec[]): Dec {
    return xs.reduce((a, b) => (b.lt(a) ? b : a));
  }
  static max(...xs: Dec[]): Dec {
    return xs.reduce((a, b) => (b.gt(a) ? b : a));
  }
  static sum(xs: Iterable<Dec>): Dec {
    let t = Dec.ZERO;
    for (const x of xs) t = t.add(x);
    return t;
  }

  /** Round to `dp` decimal places (dp may be negative: -2 rounds to hundreds). */
  round(dp: number, mode: RoundMode = "half_up"): Dec {
    if (this.s <= dp) return this;
    const drop = pow10(this.s - dp);
    const q = this.m / drop; // truncates toward zero
    const r = this.m % drop;
    if (r === 0n) return dp >= 0 ? new Dec(q, dp).trim() : new Dec(q * pow10(-dp), 0);
    const neg = this.m < 0n;
    const twice = (r < 0n ? -r : r) * 2n;
    let up = false;
    switch (mode) {
      case "truncate":
        up = false;
        break;
      case "floor":
        up = neg;
        break;
      case "ceil":
        up = !neg;
        break;
      case "half_up":
        up = twice >= drop;
        break;
      case "half_even":
        up = twice > drop || (twice === drop && (q < 0n ? -q : q) % 2n === 1n);
        break;
    }
    const qq = up ? (neg ? q - 1n : q + 1n) : q;
    return dp >= 0 ? new Dec(qq, dp).trim() : new Dec(qq * pow10(-dp), 0);
  }

  toNumber(): number {
    return Number(this.toString());
  }
  /** Plain decimal text, no exponent, no trailing zeros ("12.5", "-0.001", "100"). */
  toString(): string {
    if (this.s === 0) return this.m.toString();
    const neg = this.m < 0n;
    const digits = (neg ? -this.m : this.m).toString().padStart(this.s + 1, "0");
    const int = digits.slice(0, digits.length - this.s);
    const frac = digits.slice(digits.length - this.s).replace(/0+$/, "");
    return `${neg ? "-" : ""}${int}${frac ? `.${frac}` : ""}`;
  }
  /** Fixed number of places (half-up), e.g. toFixed(2) → "1234.50". */
  toFixed(dp: number): string {
    const r = this.round(dp, "half_up");
    const [i, f = ""] = r.toString().split(".");
    return dp > 0 ? `${i}.${f.padEnd(dp, "0")}` : i;
  }
  toJSON(): string {
    return this.toString();
  }
}

/** Shorthand. */
export const D = (v: number | string | bigint | Dec) => Dec.of(v);
