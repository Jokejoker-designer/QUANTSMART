// quantToFormulaLab — THE bridge: a QuantLab L3 formula (QuantFormulaAst over L1/L2 evidence) → a
// FormulaCoordinateInput the Coordinate Lab can render. Strategy: translate the POINT-WISE arithmetic structure
// 1:1 into the Lab's FormulaNode; CUT every non-pointwise node (ROLLING/LOGIC/MACRO/unmapped) into a PRE-EVALUATED
// variable (its causal series via evaluateSeries), exactly as the Lab's `L3_AST_NODE` layer + `rollingVarIds` intend.
// Pure transform · advisory · no engine/order. Indices/series are causal (evaluateSeries reads only window ≤ i).
import type { FormulaCoordinateInput, FormulaNode, VariableSpec, AxisTransform, VariableLayer, VariableSemantic } from "../core/coordinateTypes";
import type { QuantFormulaAst, QuantAstNode } from "../../lib/blocks/quantAstTypes.ts";
import { OP_SPEC } from "../../lib/blocks/quantAstTypes.ts";
import { evaluateSeries } from "../../lib/blocks/quantAstEvaluator.ts";
import type { QuantMacro } from "../../lib/blocks/quantMacroRegistry.ts";

export interface QuantToLabOptions {
  ast: QuantFormulaAst;
  inputs: Record<string, number[]>;            // inputRef → causal series (built by the caller via inputSeries(key, bars))
  n: number;                                   // series length
  macros?: Record<string, QuantMacro>;
  bars?: { t: string }[];                      // optional, for replay sample timestamps
  inputMeta?: (key: string) => { displayName?: string; layer?: VariableLayer; transform?: AxisTransform; semantic?: VariableSemantic };
  name?: string;
}

const num = (value: number): FormulaNode => ({ kind: "num", value });
const v = (id: string): FormulaNode => ({ kind: "var", id });
const bin = (op: "+" | "-" | "*" | "/" | "pow", a: FormulaNode, b: FormulaNode): FormulaNode => ({ kind: "binary", op, a, b });
const call = (fn: any, args: FormulaNode[]): FormulaNode => ({ kind: "call", fn, args });

const rangeOf = (s: number[]): [number, number] => {
  let lo = Infinity, hi = -Infinity;
  for (const x of s) { if (Number.isFinite(x)) { if (x < lo) lo = x; if (x > hi) hi = x; } }
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) return [lo - 1 || -1, hi + 1 || 1];
  const pad = (hi - lo) * 0.04;
  return [+(lo - pad).toFixed(6), +(hi + pad).toFixed(6)];
};

// QuantLab POINT_OP → Lab FormulaNode (1:1). Returns null when there is no clean Lab equivalent ⇒ caller CUTs it.
function mapPointOp(node: QuantAstNode, kids: FormulaNode[]): FormulaNode | null {
  switch (node.op) {
    case "ADD": return bin("+", kids[0], kids[1]);
    case "SUB": return bin("-", kids[0], kids[1]);
    case "MUL": return bin("*", kids[0], kids[1]);
    case "DIV": return bin("/", kids[0], kids[1]);
    case "POW": return bin("pow", kids[0], kids[1]);
    case "NEG": return { kind: "unary", op: "neg", arg: kids[0] };
    case "LOG": return call("log", [kids[0]]);
    case "EXP": return call("exp", [kids[0]]);
    case "SQRT": return call("sqrt", [kids[0]]);
    case "ABS": return call("abs", [kids[0]]);
    case "SIGMOID": return call("sigmoid", [kids[0]]);
    case "TANH": return call("tanh", [kids[0]]);
    case "MIN": return call("min", [kids[0], kids[1]]);
    case "MAX": return call("max", [kids[0], kids[1]]);
    case "CLIP": return call("clamp", [kids[0], num(node.params?.min ?? -1), num(node.params?.max ?? 1)]);
    default: return null;   // SIGN / unknown → CUT to a variable
  }
}

export function quantToFormulaLab(opts: QuantToLabOptions): FormulaCoordinateInput {
  const { ast, inputs, n, macros = {}, bars, inputMeta, name } = opts;
  const variables = new Map<string, VariableSpec>();
  const rollingVarIds = new Set<string>();

  const evalNode = (nodeId: string): number[] => evaluateSeries({ ...ast, rootNodeId: nodeId }, inputs, n, macros).root;
  const finiteAll = (s: number[]) => s.every((x) => Number.isFinite(x));

  function addVar(id: string, series: number[], spec: { displayName: string; layer: VariableLayer; transform: AxisTransform; semantic?: VariableSemantic; rolling?: boolean }) {
    if (variables.has(id)) return;
    variables.set(id, {
      id, displayName: spec.displayName, layer: spec.layer, series,
      defaultRange: rangeOf(series), defaultTransform: spec.transform, semantic: spec.semantic,
      safety: { noLookahead: true, finite: finiteAll(series), causalSafe: true },
    });
    if (spec.rolling) rollingVarIds.add(id);
  }

  function toFL(nodeId: string): FormulaNode {
    const node = ast.nodes[nodeId];
    if (!node) return num(0);
    if (node.kind === "CONST") return num(node.constValue ?? 0);
    if (node.kind === "INPUT") {
      const ref = node.inputRef ?? nodeId;
      const meta = inputMeta?.(ref) ?? {};
      addVar(ref, inputs[ref] ?? evalNode(nodeId), { displayName: meta.displayName ?? ref, layer: meta.layer ?? "L2", transform: meta.transform ?? "RAW", semantic: meta.semantic });
      return v(ref);
    }
    if (node.kind === "POINT_OP") {
      const mapped = mapPointOp(node, (node.children ?? []).map(toFL));
      if (mapped) return mapped;
    }
    // ROLLING_OP / LOGIC_OP / MACRO / unmapped POINT_OP → CUT: pre-evaluate this subtree to a causal series ⇒ variable
    const vid = "n_" + nodeId;
    const label = node.kind === "MACRO" ? (node.params?.macroId ?? "macro") : (node.op ? OP_SPEC[node.op]?.label ?? node.op : node.kind);
    addVar(vid, evalNode(nodeId), { displayName: `${label}(…)`, layer: "L3_AST_NODE", transform: "RAW", semantic: "FORMULA_OUTPUT", rolling: node.kind === "ROLLING_OP" });
    return v(vid);
  }

  const formulaAst = toFL(ast.rootNodeId);
  const rootSeries = evalNode(ast.rootNodeId);
  // ensure at least 2 axes so the surface/heatmap has an X and a Y
  if (variables.size < 2) {
    for (const [k, s] of Object.entries(inputs)) {
      if (variables.has(k)) continue;
      const meta = inputMeta?.(k) ?? {};
      addVar(k, s, { displayName: meta.displayName ?? k, layer: meta.layer ?? "L2", transform: meta.transform ?? "RAW", semantic: meta.semantic });
      if (variables.size >= 2) break;
    }
  }

  return {
    formulaId: ast.formulaId || "ql_" + Date.now().toString(36),
    formulaName: name || ast.name || "QuantLab formula",
    formulaAst,
    formulaText: "", // caller may fill from astToText
    variables: [...variables.values()],
    replayBars: bars?.map((b) => ({ timestamp: b.t })),
    selectedBarIndex: n - 1,
    rollingVarIds: [...rollingVarIds],
    safety: { kidiSafe: true, noLookahead: true, finiteOutput: finiteAll(rootSeries) },
  };
}
