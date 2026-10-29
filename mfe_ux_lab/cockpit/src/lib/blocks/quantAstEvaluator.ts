// quantAstEvaluator — the CAUSAL AST evaluator. evaluateSeries walks the tree bottom-up returning every node's
// series (so the UI can show any branch's contribution). Rolling ops read only window [i−W+1 .. i]; LAG/DELTA look
// back; EMA is forward-cumulative — none read a future bar. MACRO_REF expands the macro AST with children bound to
// its input slots and the ref's window inherited. All values pass through the safe-math seal. Output is a number.
import { OP_SPEC, type QuantFormulaAst, type QuantAstNode } from "./quantAstTypes.ts";
import { seal, safeDiv, safeLog, safeSqrt, clampExp, sigmoid, safePow, EPS } from "./quantAstSafety.ts";
import type { QuantMacro } from "./quantMacroRegistry.ts";

const zeros = (n: number) => new Array(n).fill(0);
function rollWin(s: number[], W: number, fn: (w: number[]) => number): number[] {
  return s.map((_, i) => { const w = s.slice(Math.max(0, i - W + 1), i + 1); return w.length ? fn(w) : 0; });
}
const sum = (w: number[]) => w.reduce((a, b) => a + b, 0);
const mean = (w: number[]) => sum(w) / w.length;
const std = (w: number[]) => { const m = mean(w); return Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / w.length); };
const quantileOf = (w: number[], q: number) => { if (!w.length) return 0; const s = w.slice().sort((a, b) => a - b); const p = Math.max(0, Math.min(1, q)) * (s.length - 1); const lo = Math.floor(p), hi = Math.ceil(p); return s[lo] + (s[hi] - s[lo]) * (p - lo); };
const median = (w: number[]) => quantileOf(w, 0.5);
const mad = (w: number[]) => { const m = median(w); return median(w.map((v) => Math.abs(v - m))); };

function applyOp(nd: QuantAstNode, kids: number[][], n: number, macroWindow?: number): number[] {
  const op = nd.op!, a = kids[0] ?? zeros(n), b = kids[1] ?? zeros(n), c = kids[2] ?? zeros(n);
  const W = Math.max(2, Math.round(nd.params?.window ?? macroWindow ?? 20));
  const K = Math.max(1, Math.round(nd.params?.lag ?? 1));
  switch (op) {
    case "ADD": return a.map((v, i) => v + b[i]);
    case "SUB": return a.map((v, i) => v - b[i]);
    case "MUL": return a.map((v, i) => v * b[i]);
    case "DIV": return a.map((v, i) => safeDiv(v, b[i]));
    case "POW": return a.map((v, i) => safePow(v, b[i]));
    case "LOG": return a.map((v) => safeLog(v));
    case "EXP": return a.map((v) => clampExp(v));
    case "SQRT": return a.map((v) => safeSqrt(v));
    case "ABS": return a.map((v) => Math.abs(v));
    case "NEG": return a.map((v) => -v);
    case "SIGN": return a.map((v) => Math.sign(v));
    case "MIN": return a.map((v, i) => Math.min(v, b[i]));
    case "MAX": return a.map((v, i) => Math.max(v, b[i]));
    case "CLIP": { const lo = nd.params?.min ?? -1, hi = nd.params?.max ?? 1; return a.map((v) => Math.max(lo, Math.min(hi, v))); }
    case "SIGMOID": return a.map((v) => sigmoid(v));
    case "TANH": return a.map((v) => Math.tanh(v));
    case "GT": return a.map((v, i) => (v > b[i] ? 1 : 0));
    case "LT": return a.map((v, i) => (v < b[i] ? 1 : 0));
    case "EQ": return a.map((v, i) => (Math.abs(v - b[i]) < EPS ? 1 : 0));
    case "AND": return a.map((v, i) => (v > 0.5 && b[i] > 0.5 ? 1 : 0));
    case "OR": return a.map((v, i) => (v > 0.5 || b[i] > 0.5 ? 1 : 0));
    case "NOT": return a.map((v) => (v > 0.5 ? 0 : 1));
    case "IF_ELSE": return a.map((v, i) => (v > 0.5 ? b[i] : c[i]));
    case "ROLL_MEAN": return rollWin(a, W, mean);
    case "ROLL_STD": return rollWin(a, W, std);
    case "ROLL_SUM": return rollWin(a, W, sum);
    case "ROLL_MAX": return rollWin(a, W, (w) => Math.max(...w));
    case "ROLL_MIN": return rollWin(a, W, (w) => Math.min(...w));
    case "PERCENTILE_RANK": return a.map((v, i) => { const w = a.slice(Math.max(0, i - W + 1), i + 1); return w.length ? w.filter((x) => x <= v).length / w.length : 0.5; });
    case "LAG": return a.map((_, i) => (i - K >= 0 ? a[i - K] : 0));
    case "DELTA": return a.map((v, i) => (i - K >= 0 ? v - a[i - K] : 0));
    case "EMA": { const k = 2 / (W + 1); let e = a[0] ?? 0; return a.map((v, i) => (i === 0 ? (e = v) : (e = v * k + e * (1 - k)))); }
    case "MEDIAN": return rollWin(a, W, median);
    case "MAD": return rollWin(a, W, mad);
    case "IQR": return rollWin(a, W, (w) => quantileOf(w, 0.75) - quantileOf(w, 0.25));
    case "ROBUSTZ": return rollWin(a, W, (w) => { const md = mad(w) * 1.4826; return md > EPS ? (w[w.length - 1] - median(w)) / md : 0; });
    case "OUTLIER": return rollWin(a, W, (w) => { const md = mad(w) * 1.4826; return md > EPS ? Math.abs(w[w.length - 1] - median(w)) / md : 0; });
    case "QUANTILE": { const q = nd.params?.q ?? 0.5; return rollWin(a, W, (w) => quantileOf(w, q)); }
    case "WINSOR": { const q = nd.params?.q ?? 0.05; return rollWin(a, W, (w) => { const lo = quantileOf(w, q), hi = quantileOf(w, 1 - q); return Math.max(lo, Math.min(hi, w[w.length - 1])); }); }
    default: return a.slice();
  }
}

export interface EvalResult { root: number[]; nodes: Record<string, number[]> }

export function evaluateSeries(ast: QuantFormulaAst, inputs: Record<string, number[]>, n: number, macros: Record<string, QuantMacro> = {}, macroWindow?: number): EvalResult {
  const cache = new Map<string, number[]>();
  const ev = (id: string): number[] => {
    if (cache.has(id)) return cache.get(id)!;
    const nd = ast.nodes[id];
    let out: number[];
    if (!nd) out = zeros(n);
    else if (nd.kind === "INPUT") out = (inputs[nd.inputRef!] ?? zeros(n)).map(seal);
    else if (nd.kind === "CONST") out = new Array(n).fill(seal(nd.constValue ?? 0));
    else if (nd.op === "MACRO_REF") {
      const macro = macros[nd.params?.macroId ?? ""];
      if (!macro) out = zeros(n);
      else { const childSeries = (nd.children ?? []).map(ev); const bound: Record<string, number[]> = {}; macro.inputs.forEach((k, idx) => { bound[k] = childSeries[idx] ?? zeros(n); }); out = evaluateSeries(macro.ast, bound, n, macros, nd.params?.window ?? macroWindow).root; }
    } else out = applyOp(nd, (nd.children ?? []).map(ev), n, macroWindow);
    out = out.map(seal);
    cache.set(id, out);
    return out;
  };
  const root = ev(ast.rootNodeId);
  const nodes: Record<string, number[]> = {};
  cache.forEach((v, k) => { nodes[k] = v; });
  if (ast.outputType === "PROBABILITY_LIKE_SCORE") return { root: root.map(sigmoid), nodes };
  return { root, nodes };
}

// convenience: value at a single bar (uses the full causal series then indexes — never reads beyond i).
export function evaluateAt(ast: QuantFormulaAst, inputs: Record<string, number[]>, i: number, n: number, macros: Record<string, QuantMacro> = {}): number {
  return evaluateSeries(ast, inputs, n, macros).root[i] ?? 0;
}

// human-readable string of the formula tree.
export { OP_SPEC };
