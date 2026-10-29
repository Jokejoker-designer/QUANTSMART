/**
 * formulaSurfaceEvaluator.ts — safe AST evaluator for L3 formulas.
 *
 * Walks a FormulaNode against an environment (variable id → value). Every
 * unsafe operation is routed through kidiFormulaWalls so the result is a typed
 * {value, wall} rather than a crash or a silent NaN. Deterministic: the same
 * AST + env always yields the same result.
 */
import type { FormulaNode, EvalResult, WallState } from "./coordinateTypes";
import { safeDiv, safeLog, safeSqrt, safeExp, safePow, seal } from "./kidiFormulaWalls";

export type Env = Record<string, number>;
export type WeightEnv = Record<string, number>;

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Evaluate a formula node. `first` carries the first wall encountered so the
 * caller can label the cell. We keep evaluating (best-effort) so the shape of
 * safe sub-regions still renders.
 */
export function evalFormula(
  node: FormulaNode,
  env: Env,
  weights: WeightEnv = {},
): EvalResult {
  let firstWall: WallState | null = null;
  const note = (w: WallState | null) => {
    if (w && !firstWall) firstWall = w;
  };

  const walk = (n: FormulaNode): number => {
    switch (n.kind) {
      case "num":
        return n.value;
      case "const":
        return n.name === "pi" ? Math.PI : Math.E;
      case "var": {
        const v = env[n.id];
        if (v === undefined || !Number.isFinite(v)) {
          note("NAN_INF_SEAL");
          return NaN;
        }
        return v;
      }
      case "weight": {
        const w = weights[n.id];
        return w === undefined ? n.value : w;
      }
      case "unary":
        return -walk(n.arg);
      case "binary": {
        const a = walk(n.a);
        const b = walk(n.b);
        if (n.op === "+") return a + b;
        if (n.op === "-") return a - b;
        if (n.op === "*") return a * b;
        if (n.op === "/") {
          const g = safeDiv(a, b);
          note(g.wall);
          return g.value;
        }
        // pow
        const g = safePow(a, b);
        note(g.wall);
        return g.value;
      }
      case "call": {
        const a = n.args.map(walk);
        switch (n.fn) {
          case "tanh": return Math.tanh(a[0]);
          case "sigmoid": return sigmoid(a[0]);
          case "sin": return Math.sin(a[0]);
          case "cos": return Math.cos(a[0]);
          case "abs": return Math.abs(a[0]);
          case "min": return Math.min(...a);
          case "max": return Math.max(...a);
          case "clamp": return Math.max(a[1], Math.min(a[2], a[0]));
          case "gate": return a[0] >= (a[1] ?? 0) ? a[0] : 0;
          case "log": { const g = safeLog(a[0]); note(g.wall); return g.value; }
          case "sqrt": { const g = safeSqrt(a[0]); note(g.wall); return g.value; }
          case "exp": { const g = safeExp(a[0]); note(g.wall); return g.value; }
        }
      }
    }
    // exhaustive — unreachable
    return NaN;
  };

  const raw = walk(node);
  const finalSeal = seal(raw);
  note(finalSeal.wall);
  return { value: finalSeal.value, wall: firstWall };
}

/** Collect the variable ids referenced by a formula (for env construction). */
export function collectVarIds(node: FormulaNode, out: Set<string> = new Set()): Set<string> {
  switch (node.kind) {
    case "var":
      out.add(node.id);
      break;
    case "unary":
      collectVarIds(node.arg, out);
      break;
    case "binary":
      collectVarIds(node.a, out);
      collectVarIds(node.b, out);
      break;
    case "call":
      node.args.forEach((a) => collectVarIds(a, out));
      break;
  }
  return out;
}

/** Collect tunable weights (id → default) for the weight-sweep panel. */
export function collectWeights(
  node: FormulaNode,
  out: Map<string, number> = new Map(),
): Map<string, number> {
  if (node.kind === "weight") out.set(node.id, node.value);
  else if (node.kind === "unary") collectWeights(node.arg, out);
  else if (node.kind === "binary") {
    collectWeights(node.a, out);
    collectWeights(node.b, out);
  } else if (node.kind === "call") node.args.forEach((a) => collectWeights(a, out));
  return out;
}
