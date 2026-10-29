// quantAstTypes — L3 QuantLab AST kernel (data, NOT free code). A formula is an expression TREE of whitelisted
// operators over L1/L2 evidence series + constants. Bigger formulas (zscore, RSI, vol-shock…) are SUBTREES built
// from primitives, optionally saved as reusable MACROS. The AST is pure data the evaluator walks — user never runs
// JS/Python. Output is a NUMBER (score/probability-like/indicator/EV component) — never an order/zone/entry.
// QL-1 (point-wise) + QL-2 (causal rolling) + QL-3 (macro ref). Extended math packs (trig/vector/info…) come later.

export type QuantNodeKind = "INPUT" | "CONST" | "POINT_OP" | "ROLLING_OP" | "LOGIC_OP" | "MACRO";
export type QuantOp =
  | "ADD" | "SUB" | "MUL" | "DIV" | "POW"
  | "LOG" | "EXP" | "SQRT" | "ABS" | "NEG" | "SIGN"
  | "MIN" | "MAX" | "CLIP" | "SIGMOID" | "TANH"
  | "GT" | "LT" | "EQ" | "AND" | "OR" | "NOT" | "IF_ELSE"
  | "ROLL_MEAN" | "ROLL_STD" | "ROLL_SUM" | "ROLL_MAX" | "ROLL_MIN"
  | "PERCENTILE_RANK" | "LAG" | "DELTA" | "EMA"
  | "MEDIAN" | "MAD" | "IQR" | "ROBUSTZ" | "QUANTILE" | "WINSOR" | "OUTLIER"
  | "MACRO_REF";

export type QuantOutputType = "SCORE" | "PROBABILITY_LIKE_SCORE" | "INDICATOR" | "EV_COMPONENT";
export type QuantStatus = "DRAFT" | "SANDBOX" | "SHADOW" | "RESEARCH_ONLY" | "OOS_QUALIFIED" | "CARD_ELIGIBLE" | "REJECTED";

export interface QuantNodeSafety { kidiGuard?: boolean; domainGuard?: boolean; clampGuard?: boolean; causalOnly: true }
export interface QuantAstNode {
  nodeId: string;
  kind: QuantNodeKind;
  op?: QuantOp;
  inputRef?: string;          // INPUT: an L1/L2 evidence series key
  constValue?: number;        // CONST
  children?: string[];        // operand node ids (order matters)
  params?: { window?: number; lag?: number; min?: number; max?: number; q?: number; macroId?: string };
  safety: QuantNodeSafety;
}
export interface QuantAuthority { advisoryOnly: true; noEntry: true; noZone: true; noOrderSend: true; noAutoLot: true; notLiveReady: true }
export const QUANT_AUTHORITY: QuantAuthority = { advisoryOnly: true, noEntry: true, noZone: true, noOrderSend: true, noAutoLot: true, notLiveReady: true };

export interface QuantFormulaAst {
  formulaId: string; name: string; version: string;
  rootNodeId: string; nodes: Record<string, QuantAstNode>;
  inputs?: string[];                  // declared evidence inputs (or macro input slots)
  outputType: QuantOutputType;
  authority: QuantAuthority;
  status: QuantStatus;
}

export interface OpSpec { kind: QuantNodeKind; arity: number; label: string; guard?: "kidi" | "domain" | "clamp"; windowed?: boolean }
// arity −1 = variadic (macro). windowed ops read a rolling window ending at the current bar (causal).
export const OP_SPEC: Record<QuantOp, OpSpec> = {
  ADD: { kind: "POINT_OP", arity: 2, label: "+" }, SUB: { kind: "POINT_OP", arity: 2, label: "−" }, MUL: { kind: "POINT_OP", arity: 2, label: "×" },
  DIV: { kind: "POINT_OP", arity: 2, label: "÷", guard: "kidi" }, POW: { kind: "POINT_OP", arity: 2, label: "^", guard: "clamp" },
  LOG: { kind: "POINT_OP", arity: 1, label: "log", guard: "domain" }, EXP: { kind: "POINT_OP", arity: 1, label: "exp", guard: "clamp" }, SQRT: { kind: "POINT_OP", arity: 1, label: "√", guard: "domain" },
  ABS: { kind: "POINT_OP", arity: 1, label: "abs" }, NEG: { kind: "POINT_OP", arity: 1, label: "neg" }, SIGN: { kind: "POINT_OP", arity: 1, label: "sign" },
  MIN: { kind: "POINT_OP", arity: 2, label: "min" }, MAX: { kind: "POINT_OP", arity: 2, label: "max" }, CLIP: { kind: "POINT_OP", arity: 1, label: "clip" },
  SIGMOID: { kind: "POINT_OP", arity: 1, label: "sigmoid" }, TANH: { kind: "POINT_OP", arity: 1, label: "tanh" },
  GT: { kind: "LOGIC_OP", arity: 2, label: ">" }, LT: { kind: "LOGIC_OP", arity: 2, label: "<" }, EQ: { kind: "LOGIC_OP", arity: 2, label: "==" },
  AND: { kind: "LOGIC_OP", arity: 2, label: "AND" }, OR: { kind: "LOGIC_OP", arity: 2, label: "OR" }, NOT: { kind: "LOGIC_OP", arity: 1, label: "NOT" }, IF_ELSE: { kind: "LOGIC_OP", arity: 3, label: "if" },
  ROLL_MEAN: { kind: "ROLLING_OP", arity: 1, label: "mean", windowed: true }, ROLL_STD: { kind: "ROLLING_OP", arity: 1, label: "std", windowed: true, guard: "kidi" },
  ROLL_SUM: { kind: "ROLLING_OP", arity: 1, label: "sum", windowed: true }, ROLL_MAX: { kind: "ROLLING_OP", arity: 1, label: "rmax", windowed: true }, ROLL_MIN: { kind: "ROLLING_OP", arity: 1, label: "rmin", windowed: true },
  PERCENTILE_RANK: { kind: "ROLLING_OP", arity: 1, label: "pctrank", windowed: true }, LAG: { kind: "ROLLING_OP", arity: 1, label: "lag" }, DELTA: { kind: "ROLLING_OP", arity: 1, label: "delta" }, EMA: { kind: "ROLLING_OP", arity: 1, label: "ema", windowed: true },
  MEDIAN: { kind: "ROLLING_OP", arity: 1, label: "median", windowed: true }, MAD: { kind: "ROLLING_OP", arity: 1, label: "mad", windowed: true }, IQR: { kind: "ROLLING_OP", arity: 1, label: "iqr", windowed: true },
  ROBUSTZ: { kind: "ROLLING_OP", arity: 1, label: "robustz", windowed: true, guard: "kidi" }, QUANTILE: { kind: "ROLLING_OP", arity: 1, label: "quantile", windowed: true }, WINSOR: { kind: "ROLLING_OP", arity: 1, label: "winsorize", windowed: true, guard: "clamp" }, OUTLIER: { kind: "ROLLING_OP", arity: 1, label: "outlierscore", windowed: true, guard: "kidi" },
  MACRO_REF: { kind: "MACRO", arity: -1, label: "macro" },
};

let _seq = 0;
export const nid = (p = "n") => p + Date.now().toString(36) + (_seq++);
export const CAUSAL: QuantNodeSafety = { causalOnly: true };
export const mkInput = (ref: string, id = nid("in")): QuantAstNode => ({ nodeId: id, kind: "INPUT", inputRef: ref, safety: CAUSAL });
export const mkConst = (v: number, id = nid("c")): QuantAstNode => ({ nodeId: id, kind: "CONST", constValue: v, safety: CAUSAL });
export const mkOp = (op: QuantOp, children: string[], params?: QuantAstNode["params"], id = nid("op")): QuantAstNode => ({ nodeId: id, kind: OP_SPEC[op].kind, op, children, params, safety: { causalOnly: true, kidiGuard: OP_SPEC[op].guard === "kidi", domainGuard: OP_SPEC[op].guard === "domain", clampGuard: OP_SPEC[op].guard === "clamp" } });

export function emptyFormula(name: string): QuantFormulaAst {
  const root = mkConst(0);
  return { formulaId: "f" + Date.now().toString(36), name, version: "1", rootNodeId: root.nodeId, nodes: { [root.nodeId]: root }, inputs: [], outputType: "SCORE", authority: QUANT_AUTHORITY, status: "DRAFT" };
}
