/**
 * TEMPLATE FORMULAS, evaluated exactly.
 *
 * A Procol pricing template defines its money columns as formulas over other
 * widgets, e.g.
 *
 *   inline  total_amount = price*participant_quantity+price*participant_quantity*(gst/100)
 *   global  gross_total  = SUM(total_amount)
 *   global  tax_gst_custom = sub_total_custom*(tax_custom/100)
 *   inline  local_fx_custom = IF(local_drop_custom='opt1',(price*1),IF(...))
 *
 * This is a small, independent parser for that language (numbers, names,
 * + - * / and unary minus, parentheses, comparisons = == != <> < <= > >=,
 * AND / OR / NOT, 'strings', and the functions SUM, IF, MIN, MAX, ROUND,
 * ROUNDUP, ROUNDDOWN, ABS, AVG/AVERAGE, COUNT). Values are exact decimals
 * (decimal.ts); a name with no value is 0 (blank cell), as the backend's
 * own evaluator treats a missing input (see numbers.md, "blank inputs").
 *
 * SUM(x) over an inline widget is the sum of x over the rows that the
 * caller supplies as `rows` (the bid's quoted lines); inside a row it is x.
 */
import { Dec } from "./decimal.js";

export type Value = Dec | string | boolean;

type Tok =
  | { t: "num"; v: string }
  | { t: "str"; v: string }
  | { t: "id"; v: string }
  | { t: "op"; v: string }
  | { t: "(" }
  | { t: ")" }
  | { t: "," };

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      const m = src.slice(i).match(/^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/)!;
      out.push({ t: "num", v: m[0] });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = src.slice(i).match(/^[A-Za-z_][A-Za-z0-9_.]*/)!;
      out.push({ t: "id", v: m[0] });
      i += m[0].length;
      continue;
    }
    if (c === "'" || c === '"') {
      const j = src.indexOf(c, i + 1);
      if (j < 0) throw new Error(`unterminated string in formula: ${src}`);
      out.push({ t: "str", v: src.slice(i + 1, j) });
      i = j + 1;
      continue;
    }
    if (c === "(") {
      out.push({ t: "(" });
      i++;
      continue;
    }
    if (c === ")") {
      out.push({ t: ")" });
      i++;
      continue;
    }
    if (c === ",") {
      out.push({ t: "," });
      i++;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (["<=", ">=", "!=", "<>", "==", "&&", "||"].includes(two)) {
      out.push({ t: "op", v: two });
      i += 2;
      continue;
    }
    if ("+-*/<>=!%^".includes(c)) {
      out.push({ t: "op", v: c });
      i++;
      continue;
    }
    throw new Error(`unexpected "${c}" in formula: ${src}`);
  }
  return out;
}

export type Node =
  | { k: "num"; v: Dec }
  | { k: "str"; v: string }
  | { k: "ref"; name: string }
  | { k: "un"; op: string; a: Node }
  | { k: "bin"; op: string; a: Node; b: Node }
  | { k: "call"; fn: string; args: Node[] };

/** Parse a formula into a tree (precedence: OR < AND < comparison < + - < * / < unary). */
export function parseFormula(src: string): Node {
  const toks = lex(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => peek()?.t === "op" && (peek() as { v: string }).v === v;
  const isWord = (v: string) => peek()?.t === "id" && (peek() as { v: string }).v.toUpperCase() === v;

  function or(): Node {
    let a = and();
    while (isOp("||") || isWord("OR")) {
      p++;
      a = { k: "bin", op: "or", a, b: and() };
    }
    return a;
  }
  function and(): Node {
    let a = cmp();
    while (isOp("&&") || isWord("AND")) {
      p++;
      a = { k: "bin", op: "and", a, b: cmp() };
    }
    return a;
  }
  function cmp(): Node {
    let a = add();
    for (;;) {
      const t = peek();
      if (t?.t !== "op" || !["=", "==", "!=", "<>", "<", "<=", ">", ">="].includes(t.v)) return a;
      p++;
      const op = t.v === "==" ? "=" : t.v === "<>" ? "!=" : t.v;
      a = { k: "bin", op, a, b: add() };
    }
  }
  function add(): Node {
    let a = mul();
    while (isOp("+") || isOp("-")) {
      const op = (toks[p++] as { v: string }).v;
      a = { k: "bin", op, a, b: mul() };
    }
    return a;
  }
  function mul(): Node {
    let a = unary();
    while (isOp("*") || isOp("/") || isOp("%")) {
      const op = (toks[p++] as { v: string }).v;
      a = { k: "bin", op, a, b: unary() };
    }
    return a;
  }
  function unary(): Node {
    if (isOp("-") || isOp("+")) {
      const op = (toks[p++] as { v: string }).v;
      return op === "-" ? { k: "un", op: "-", a: unary() } : unary();
    }
    if (isOp("!") || isWord("NOT")) {
      // NOT(x) as a function is handled in atom(); bare NOT x here
      if (isWord("NOT") && toks[p + 1]?.t === "(") return atom();
      p++;
      return { k: "un", op: "!", a: unary() };
    }
    return atom();
  }
  function atom(): Node {
    const t = toks[p++];
    if (!t) throw new Error(`formula ends early: ${src}`);
    if (t.t === "num") return { k: "num", v: Dec.of(t.v) };
    if (t.t === "str") return { k: "str", v: t.v };
    if (t.t === "(") {
      const e = or();
      if (peek()?.t !== ")") throw new Error(`missing ) in formula: ${src}`);
      p++;
      return e;
    }
    if (t.t === "id") {
      if (peek()?.t === "(") {
        p++;
        const args: Node[] = [];
        if (peek()?.t !== ")") {
          args.push(or());
          while (peek()?.t === ",") {
            p++;
            args.push(or());
          }
        }
        if (peek()?.t !== ")") throw new Error(`missing ) after ${t.v}( in formula: ${src}`);
        p++;
        return { k: "call", fn: t.v.toUpperCase(), args };
      }
      const up = t.v.toUpperCase();
      if (up === "TRUE" || up === "FALSE") return { k: "str", v: up };
      return { k: "ref", name: t.v };
    }
    throw new Error(`unexpected token in formula: ${src}`);
  }
  const tree = or();
  if (p !== toks.length) throw new Error(`unexpected text after position ${p} in formula: ${src}`);
  return tree;
}

/** Every widget name a formula reads, and which of them it reads inside SUM()/aggregates. */
export function references(n: Node, inAgg = false, out = { plain: new Set<string>(), aggregated: new Set<string>() }) {
  switch (n.k) {
    case "ref":
      (inAgg ? out.aggregated : out.plain).add(n.name);
      break;
    case "un":
      references(n.a, inAgg, out);
      break;
    case "bin":
      references(n.a, inAgg, out);
      references(n.b, inAgg, out);
      break;
    case "call": {
      const agg = ["SUM", "AVG", "AVERAGE", "COUNT", "MINA", "MAXA"].includes(n.fn);
      for (const a of n.args) references(a, inAgg || agg, out);
      break;
    }
  }
  return out;
}

export interface Scope {
  /** the value of a name in the current row / bid */
  get(name: string): Value | undefined;
  /** every row's value of an inline name (for SUM etc.); undefined outside a bid */
  column?(name: string): Array<Value | undefined>;
}

/** Thrown for a division by zero, so the caller can say what the app should show. */
export class FormulaDivZero extends Error {}

const num = (v: Value | undefined): Dec => {
  if (v === undefined || v === "" || v === null) return Dec.ZERO;
  if (v instanceof Dec) return v;
  if (typeof v === "boolean") return v ? Dec.ONE : Dec.ZERO;
  return Dec.tryOf(v) ?? Dec.ZERO;
};
const truthy = (v: Value | undefined): boolean => (typeof v === "boolean" ? v : v instanceof Dec ? !v.isZero() : !!v && v !== "FALSE");
function eqv(a: Value | undefined, b: Value | undefined): boolean {
  if (a instanceof Dec || b instanceof Dec) {
    const x = typeof a === "string" ? Dec.tryOf(a) : a instanceof Dec ? a : undefined;
    const y = typeof b === "string" ? Dec.tryOf(b) : b instanceof Dec ? b : undefined;
    if (x && y) return x.eq(y);
  }
  return String(a ?? "") === String(b ?? "");
}

export function evaluate(n: Node, scope: Scope): Value {
  switch (n.k) {
    case "num":
      return n.v;
    case "str":
      return n.v === "TRUE" ? true : n.v === "FALSE" ? false : n.v;
    case "ref":
      return scope.get(n.name) ?? Dec.ZERO;
    case "un":
      return n.op === "-" ? num(evaluate(n.a, scope)).neg() : !truthy(evaluate(n.a, scope));
    case "bin": {
      if (n.op === "and") return truthy(evaluate(n.a, scope)) && truthy(evaluate(n.b, scope));
      if (n.op === "or") return truthy(evaluate(n.a, scope)) || truthy(evaluate(n.b, scope));
      const a = evaluate(n.a, scope);
      const b = evaluate(n.b, scope);
      switch (n.op) {
        case "+":
          return num(a).add(num(b));
        case "-":
          return num(a).sub(num(b));
        case "*":
          return num(a).mul(num(b));
        case "/": {
          const d = num(b);
          if (d.isZero()) throw new FormulaDivZero(`division by zero`);
          return num(a).div(d);
        }
        case "%": {
          const d = num(b);
          if (d.isZero()) throw new FormulaDivZero(`modulo by zero`);
          const q = num(a).div(d).round(0, "floor");
          return num(a).sub(q.mul(d));
        }
        case "=":
          return eqv(a, b);
        case "!=":
          return !eqv(a, b);
        case "<":
          return num(a).lt(num(b));
        case "<=":
          return !num(a).gt(num(b));
        case ">":
          return num(a).gt(num(b));
        case ">=":
          return !num(a).lt(num(b));
      }
      throw new Error(`operator ${n.op}`);
    }
    case "call": {
      const f = n.fn;
      if (f === "IF") return truthy(evaluate(n.args[0], scope)) ? evaluate(n.args[1], scope) : n.args[2] ? evaluate(n.args[2], scope) : Dec.ZERO;
      if (f === "NOT") return !truthy(evaluate(n.args[0], scope));
      if (["SUM", "AVG", "AVERAGE", "COUNT"].includes(f)) {
        const vals: Dec[] = [];
        for (const a of n.args) {
          if (a.k === "ref" && scope.column) {
            for (const v of scope.column(a.name)) if (v !== undefined && v !== "") vals.push(num(v));
          } else if (scope.column) {
            // SUM over an expression of inline names: evaluate it per row
            const refs = [...references(a).plain];
            const cols = refs.map((r) => scope.column!(r));
            const rows = Math.max(0, ...cols.map((c) => c.length));
            for (let i = 0; i < rows; i++) {
              const rowScope: Scope = { get: (nm) => { const k = refs.indexOf(nm); return k >= 0 ? cols[k][i] : scope.get(nm); } };
              vals.push(num(evaluate(a, rowScope)));
            }
          } else vals.push(num(evaluate(a, scope)));
        }
        if (f === "COUNT") return Dec.of(vals.length);
        const s = Dec.sum(vals);
        if (f === "SUM") return s;
        if (!vals.length) throw new FormulaDivZero("average of nothing");
        return s.div(vals.length);
      }
      const xs = n.args.map((a) => evaluate(a, scope));
      switch (f) {
        case "MIN":
          return Dec.min(...xs.map(num));
        case "MAX":
          return Dec.max(...xs.map(num));
        case "ABS":
          return num(xs[0]).abs();
        case "ROUND":
          return num(xs[0]).round(xs[1] === undefined ? 0 : num(xs[1]).toNumber(), "half_up");
        case "ROUNDUP":
          return num(xs[0]).round(xs[1] === undefined ? 0 : num(xs[1]).toNumber(), num(xs[0]).sign() < 0 ? "floor" : "ceil");
        case "ROUNDDOWN":
          return num(xs[0]).round(xs[1] === undefined ? 0 : num(xs[1]).toNumber(), "truncate");
      }
      throw new Error(`the oracle does not know the function ${f}()`);
    }
  }
}

export const asDec = num;
